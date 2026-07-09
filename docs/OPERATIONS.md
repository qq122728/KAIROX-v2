# VORX Protocol — 运维手册

最后更新: 2026-07-09

日常运维和故障排查指南，供运维人员和 AI Agent 使用。

## 速览

生产环境运行三个 PM2 进程:

| 进程 | 端口 | 职责 |
|------|------|------|
| `vorx-next` | 3020 | Next.js 应用 + API |
| `vorx-socket` | 3021 | Socket.IO 实时通信 |
| `vorx-settlement` | — | 二元期权到期结算 |

关键路径:

```bash
APP_DIR=/var/www/vorx
DATA_DIR=/var/lib/vorx
BACKUP_DIR=/var/backups/vorx
DB_PATH=/var/lib/vorx/vorx.sqlite
ENV_FILE=/var/www/vorx/.env.production.local
LOG_DIR=/var/www/vorx/logs
```

⚠️ 密钥不存 Git。`.env.production.local` 是生产配置的唯一来源。

## 每日健康检查

```bash
cd /var/www/vorx
pm2 status
curl -s -o /dev/null -w '%{http_code}' http://localhost:3020          # 200
curl -s http://localhost:3021/health                                  # 200
ls -lh /var/lib/vorx/vorx.sqlite
ls -lh /var/backups/vorx | tail -3
```

期望: 三个进程 online, app 返回 200, socket 返回 200, 数据库和备份存在。

## 日志

```bash
# 实时
pm2 logs vorx-next
pm2 logs vorx-socket
pm2 logs vorx-settlement

# 文件
tail -200 /var/www/vorx/logs/next-error.log
tail -200 /var/www/vorx/logs/socket-error.log
tail -200 /var/www/vorx/logs/settlement-error.log

# Nginx
tail -200 /var/log/nginx/error.log
tail -200 /var/log/nginx/access.log
```

## 安全重启

```bash
# 单进程
pm2 restart vorx-next       # 构建后记得 --update-env

# 全部
pm2 restart all

# 验证
pm2 status
curl -s -o /dev/null -w '%{http_code}' http://localhost:3020
```

## 部署更新

```bash
cd /var/www/vorx
git status --short                          # 必须是干净的工作区

# 备份数据库
cp /var/lib/vorx/vorx.sqlite "/var/backups/vorx/vorx-$(date +%Y%m%d-%H%M%S).sqlite"

# 构建 + 部署
npx next build
pm2 restart vorx-next --update-env
pm2 save

# 验证
curl -s -o /dev/null -w '%{http_code}' http://localhost:3020  # 200
curl -s https://vorxai.xyz | head -1                           # HTML
```

## 回滚

```bash
# 代码回滚
cd /var/www/vorx
git log --oneline -10
git checkout <good-commit>
npx next build
pm2 restart vorx-next --update-env

# 数据库回滚（慎用）
pm2 stop all
cp /var/backups/vorx/<backup-file>.sqlite /var/lib/vorx/vorx.sqlite
pm2 start all
```

## 数据库维护

```bash
# 完整性检查
sqlite3 /var/lib/vorx/vorx.sqlite "PRAGMA integrity_check;"   # 期望: ok

# 大小
ls -lh /var/lib/vorx/vorx.sqlite

# 待审核统计
sqlite3 /var/lib/vorx/vorx.sqlite "
SELECT 'deposits', COUNT(*) FROM deposits WHERE status='pending'
UNION ALL SELECT 'withdrawals', COUNT(*) FROM withdrawals WHERE status='pending'
UNION ALL SELECT 'kyc', COUNT(*) FROM kyc_submissions WHERE status='pending'
UNION ALL SELECT 'fiat', COUNT(*) FROM fiat_deposits WHERE status IN ('requested','bank_sent','submitted');
"

# 图片存储增长
sqlite3 /var/lib/vorx/vorx.sqlite "
SELECT COUNT(*) AS deposit_proofs FROM deposits WHERE proof_data IS NOT NULL AND proof_data<>'';
SELECT COUNT(*) AS kyc_front FROM kyc_submissions WHERE front_data IS NOT NULL AND front_data<>'';
SELECT COUNT(*) AS kyc_back FROM kyc_submissions WHERE back_data IS NOT NULL AND back_data<>'';
SELECT COUNT(*) AS fiat_proofs FROM fiat_deposits WHERE proof_data IS NOT NULL AND proof_data<>'';
"
```

## 常见故障

### 网站打不开

症状: 浏览器无法访问, Nginx 502, curl localhost 失败

```bash
pm2 status                           # 确认三个进程 online
pm2 logs vorx-next --lines 100       # 找启动错误
curl -s http://localhost:3020         # 本地可达？
tail -100 /var/log/nginx/error.log
```

修复:
- vorx-next 停了: `pm2 restart vorx-next`
- 构建文件丢失: `npx next build && pm2 restart vorx-next --update-env`
- Nginx 端口错: 检查 proxy_pass 指向 `127.0.0.1:3020`
- 环境变量缺失: 检查 `.env.production.local`

### 管理员登录失败

```bash
pm2 logs vorx-next --lines 100
sqlite3 /var/lib/vorx/vorx.sqlite "SELECT id,username,role FROM users WHERE role='admin';"
```

修复:
- 确认管理员账号存在
- 被限流: 等 `PERP_SIM_ADMIN_LOGIN_LOCK_MS` (默认 15 分钟)
- 重置密码: 见 DEPLOYMENT.md "重置密码" 章节

### 用户登录/注册失败

```bash
pm2 logs vorx-next --lines 100
sqlite3 /var/lib/vorx/vorx.sqlite "SELECT key,value FROM settings WHERE key IN ('registration_enabled','trading_enabled');"
```

- 注册被关闭: 在后台设置中开启
- 邮件验证码发不出: 检查 Resend API key 和域名验证状态
- 限流: 等待窗口过期

### 邮件验证码发不出

症状: 用户收不到验证码, 注册/忘记密码失败

```bash
# 确认 Resend API key
grep RESEND_API_KEY /var/www/vorx/.env.production.local

# 确认域名验证
curl -s -H "Authorization: Bearer $RESEND_API_KEY" \
  https://api.resend.com/domains | grep vorxai

pm2 logs vorx-next --lines 50 | grep -i "resend\|email\|send-code"
```

- API key 错误: 在 Resend Dashboard 重新生成
- 域名未验证: Resend us-east-1 中确认 vorxai.xyz 已验证
- Cloudflare 邮件 DNS: MX/SPF/DKIM 必须灰云 (DNS only)

### 实时通信不工作

症状: 管理后台显示"轮询中", 通知不实时

```bash
pm2 status                           # vorx-socket 是否 online
curl -s http://localhost:3021/health  # 期望 200
pm2 logs vorx-socket --lines 100
grep socket /var/log/nginx/error.log | tail -50
```

修复:
- 重启 socket: `pm2 restart vorx-socket`
- 确认 Nginx 代理 `/socket.io/` → `127.0.0.1:3021`
- 确认 WebSocket upgrade headers 存在
- 确认 `NEXT_PUBLIC_SOCKET_URL=https://vorxai.xyz`
- 确认 `SOCKET_INTERNAL_SECRET` = `REALTIME_INTERNAL_SECRET`

```bash
# 测试内部 emit
SECRET=$(grep SOCKET_INTERNAL_SECRET /var/www/vorx/.env.production.local | cut -d= -f2)
curl -s -X POST http://localhost:3021/internal/emit \
  -H "Content-Type: application/json" \
  -H "x-realtime-secret: $SECRET" \
  -d '{"event":"admin:update","room":"admin","payload":{"type":"test"}}'
# 期望: {"ok":true}
```

### 通知声音不响

症状: 通知中心有消息但没声音, console 报 `not-allowed`

```bash
# 浏览器 console 检查
[notify] TTS error: not-allowed
→ "Notification voice blocked by browser until user interaction."
```

根因: 浏览器要求用户手势才能播放语音

修复:
1. **点击页面任意位置** — 第一次点击会调用 `unlockAudio()` 解锁 speechSynthesis
2. 确认右上角显示 "有声" (不是 "静音")
3. 检查控制台 `[notify] TTS started:` 确认播放成功

```bash
# 测试通知声音 (服务器端)
SECRET=$(grep SOCKET_INTERNAL_SECRET /var/www/vorx/.env.production.local | cut -d= -f2)
curl -s -X POST http://localhost:3021/internal/emit \
  -H "x-realtime-secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"admin:update","room":"admin","payload":{"type":"binary:created","orderId":99999,"userId":1}}'
```

### 二元订单不结算

```bash
pm2 status                           # vorx-settlement 是否 online
pm2 logs vorx-settlement --lines 200
sqlite3 /var/lib/vorx/vorx.sqlite "
SELECT id,user_id,symbol,status,expires_at
FROM binary_orders WHERE status='open'
ORDER BY expires_at ASC LIMIT 20;
"
```

修复:
- `pm2 restart vorx-settlement`
- 确认 `SETTLEMENT_INTERVAL_MS` 已设置
- 确认 settlement 用同一个 `PERP_SIM_DB_PATH`

### 法币入金问题

症状: 入金申请无法处理, 银行信息发不出, 到账确认失败

```bash
pm2 logs vorx-next --lines 200 | grep -i "fiat\|send-bank\|confirm\|submit"

# 检查待处理法币入金
sqlite3 /var/lib/vorx/vorx.sqlite "
SELECT id,user_id,currency,status,amount_fiat,estimated_usdt,created_at
FROM fiat_deposits WHERE status IN ('requested','bank_sent','submitted')
ORDER BY created_at DESC LIMIT 10;
"

# 检查银行账户
sqlite3 /var/lib/vorx/vorx.sqlite "
SELECT id,currency,bank_name,account_holder,is_active
FROM fiat_bank_accounts ORDER BY currency;
"
```

常见问题:
- 银行账户 max_amount 设置过小 → 用户提交时报 "Maximum deposit amount is X"
  - 修复: 将 `fiat_bank_accounts.max_amount` 设为 NULL
- 确认金额偏差超过 10% → 后台拒绝
  - 修复: 确认实际到账金额, 用 `confirmedUsdt` 参数覆盖
- 汇率获取失败 → 法币入金申请成功但 send-bank 没有汇率
  - 检查 Frankfurter API 连通性

### 数据库锁定或变慢

```bash
pm2 logs vorx-next --lines 200 | grep -i "busy\|locked\|timeout"
ls -lh /var/lib/vorx/vorx.sqlite
```

修复:
- 确认三个进程用同一个 DB 路径
- busy timeout ≥ 1000ms
- 图片多时增加备份频率
- 避免在生产库上跑重查询

### 磁盘满

```bash
df -h
du -sh /var/lib/vorx /var/www/vorx/logs /var/backups/vorx
```

修复:
- 移走旧备份
- 轮转日志
- ⚠️ 不删活动 SQLite 文件
- ⚠️ 不删最新备份

### PM2 重启循环

```bash
pm2 status     # 看 restart 次数
pm2 logs vorx-next --lines 200
```

修复:
- 缺少环境变量 → 检查 `.env.production.local`
- 缺少 node_modules → `npm install`
- 缺少 .next → `npx next build`
- 端口被占用 → 检查 3020/3021 端口

### Nginx 502 或 WebSocket 失败

```bash
nginx -t
tail -200 /var/log/nginx/error.log
curl -s http://localhost:3020
curl -s http://localhost:3021/health
```

修复:
- proxy `/` → `127.0.0.1:3020`
- proxy `/socket.io/` → `127.0.0.1:3021`
- `nginx -t && systemctl reload nginx`

## 运维冒烟测试

每次部署后执行:

- [ ] 打开前台 https://vorxai.xyz
- [ ] 登录现有用户
- [ ] 打开后台 https://vorxprotocol.xyz/admin
- [ ] 登录管理员
- [ ] 通知铃铛正常显示，点击有通知面板
- [ ] 点击页面任意位置解锁声音（如有必要）
- [ ] 提交法币入金申请 → 后台收到通知 + 语音
- [ ] 提交链上充值 → 后台可预览证明图片
- [ ] 提交 KYC → 后台可预览证件
- [ ] 审核通过/拒绝 KYC
- [ ] 下小额二元单 → 后台有通知 + 语音
- [ ] 等二元单到期自动结算
- [ ] 提现申请 → 冻结 → 后台审核
- [ ] 客服消息发送 → 后台收到通知
- [ ] PM2 三进程 online
- [ ] 声音开关 (有声/静音) 正常切换

## 故障等级

**P0 — 立即响应:**
- 用户资金异常增减
- 管理员权限绕过
- 数据库损坏或数据丢失
- 提现绕过
- 交易使用不安全价格

响应: 停止受影响流程, 备份数据库, 抓日志, 必要时回滚

**P1 — 尽快修复:**
- 核心交易/结算不可用
- 管理员无法审核
- 实时通信中断 (但手动刷新可用)
- 邮件验证码无法发送

响应: 查日志 → 重启进程 → 冒烟测试

**P2 — 排期修复:**
- UI 问题
- 文案不一致
- 通知声音偶尔不响

响应: 确认生产稳定后排期

## 禁区

- ❌ 不备份直接跑删改 SQL
- ❌ 不删 `/var/lib/vorx/vorx.sqlite`
- ❌ 不把 DB 路径放在 `/var/www/vorx` 内
- ❌ 不提交 `.env.production.local`
- ❌ 不手动加余额掩盖价格源问题
- ❌ 不恢复旧备份前不确认数据损失
- ❌ 不 `git push --force` 到 master
- ❌ 不在生产环境用 `perp-sim-local-realtime-secret`
