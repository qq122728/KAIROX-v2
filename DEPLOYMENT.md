# VORX Protocol — 部署文档

最后更新: 2026-07-09

## 架构概览

VORX 运行在单台 VPS 上，通过 PM2 管理三个进程，Nginx 反向代理，Cloudflare CDN + SSL。

```
                         ┌──────────────────┐
                         │   Cloudflare     │
                         │  Flexible SSL    │
                         │  DNS proxy (🧡)  │
                         └───┬────────┬─────┘
                             │        │
              vorxai.xyz ────┘        └──── vorxprotocol.xyz
              (用户前台)                   (隐藏后台)
                             │        │
                         ┌───┴────────┴─────┐
                         │   Nginx :80       │
                         │   反向代理         │
                         └───┬────────┬─────┘
                             │        │
                    / → :3020 │        │ /socket.io/ → :3021
                             │        │
              ┌──────────────┴──┐  ┌──┴──────────────┐
              │  vorx-next      │  │  vorx-socket     │
              │  Next.js :3020  │  │  Socket.IO :3021 │
              └─────────────────┘  └──────────────────┘
              ┌──────────────────┐
              │ vorx-settlement  │
              │ 二元结算 worker   │
              └──────────────────┘
                      │
              ┌───────┴───────────┐
              │  /var/lib/vorx/   │
              │  vorx.sqlite      │
              └───────────────────┘
```

## 服务器环境

| 项目 | 配置 |
|------|------|
| OS | Ubuntu 24.04 / Linux 6.8 |
| Node | 24.x via nvm (`/root/.nvm/versions/node/v24.x/bin/node`) |
| PM2 | global install, dump 保存在 `/root/.pm2/dump.pm2` |
| Nginx | `/etc/nginx/sites-enabled/vorx` |
| 数据库 | SQLite `/var/lib/vorx/vorx.sqlite` (node:sqlite) |
| 域名 | `vorxai.xyz` (前台) + `vorxprotocol.xyz` (隐藏后台) |
| SSL | Cloudflare Flexible SSL (HTTP → Cloudflare → HTTPS → Nginx HTTP) |

## 进程管理 (PM2)

| 进程名 | 端口 | 命令 | 说明 |
|--------|------|------|------|
| `vorx-next` | 3020 | `npm run start -- -H 127.0.0.1` | Next.js 应用 + API |
| `vorx-socket` | 3021 | `npm run socket` | Socket.IO 实时通信 |
| `vorx-settlement` | — | `npm run settlement` | 二元期权到期结算 |

配置文件: `ecosystem.config.cjs`

### 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs vorx-next
pm2 logs vorx-socket
pm2 logs vorx-settlement

# 重启
pm2 restart vorx-next --update-env

# 全部重启
pm2 restart all

# 持久化（重启服务器后自动恢复）
pm2 save
```

## 构建与部署

```bash
cd /var/www/vorx

# 1. 构建
npx next build

# 2. 重启（必须 --update-env 确保环境变量生效）
pm2 restart vorx-next --update-env

# 3. 持久化
pm2 save
```

### 验证部署

```bash
# HTTP 检查
curl -s -o /dev/null -w '%{http_code}' http://localhost:3020    # 期望 200

# HTTPS 检查
curl -s -o /dev/null -w '%{http_code}' https://vorxai.xyz       # 期望 200
curl -s -o /dev/null -w '%{http_code}' https://vorxprotocol.xyz # 期望 200

# Socket 健康检查
curl -s http://localhost:3021/health
```

⚠️ **每次 build 后必须重启 PM2**，否则 PM2 缓存的旧 `.next/` 仍在运行，改动不生效。

## 环境变量

配置文件: `.env.production.local`（不提交到 git）

### 核心变量

```env
NODE_ENV=production
PORT=3020
HOSTNAME=127.0.0.1
NEXT_HOSTNAME=127.0.0.1

# 数据库路径
PERP_SIM_DB_PATH=/var/lib/vorx/vorx.sqlite

# 公开域名
NEXT_PUBLIC_APP_URL=https://vorxai.xyz
NEXT_PUBLIC_SOCKET_URL=https://vorxai.xyz
PERP_SIM_ALLOWED_ORIGINS=https://vorxai.xyz,https://vorxprotocol.xyz

# Socket 配置
SOCKET_HOST=127.0.0.1
SOCKET_PORT=3021
SOCKET_INTERNAL_URL=http://127.0.0.1:3021/internal/emit
SOCKET_INTERNAL_SECRET=<长随机密钥>
REALTIME_INTERNAL_SECRET=<同上>
```

### Email 验证 (Resend)

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
```

域名 `vorxai.xyz` 已在 Resend (us-east-1) 验证通过。

### 法币入金相关

```env
# 法币入金 USDC 上限
MAX_FIAT_DEPOSIT_USDC=10000

# 法币汇率 API
FRANKFURTER_API_BASE=https://api.frankfurter.app
```

### 通知系统相关

```env
# 二元订单大额提示音门槛（已废弃 — 现在所有订单都响铃）
NEXT_PUBLIC_ADMIN_BIG_BINARY_STAKE=500
NEXT_PUBLIC_ADMIN_BIG_TRADE_NOTIONAL=1000
```

### 完整环境变量模板

参考 `.env.example`，关键变量：

| 变量 | 作用 |
|------|------|
| `PERP_SIM_DB_PATH` | SQLite 数据库路径 |
| `NEXT_PUBLIC_APP_URL` | 前台公开 URL |
| `PERP_SIM_ALLOWED_ORIGINS` | CORS 允许的域名 |
| `SOCKET_INTERNAL_SECRET` | Socket 内部通信密钥 |
| `REALTIME_INTERNAL_SECRET` | 实时通信密钥（与 socket secret 一致） |
| `RESEND_API_KEY` | 邮件验证码 API key |

## Nginx 配置

两个域名共用同一套 Nginx 规则，都代理到本地 Next.js + Socket：

```nginx
# 用户前台
server {
    listen 80;
    server_name vorxai.xyz www.vorxai.xyz;

    # 仅允许 Cloudflare 代理流量
    if ($http_cf_ray = "") { return 403; }

    client_max_body_size 10m;

    # 安全头
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3021;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Next.js
    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# 隐藏后台 — 同上配置，server_name 改为 vorxprotocol.xyz
```

关键点：
- 两个域名打向同一个 Next.js 应用，通过代码逻辑区分前台/后台
- Cloudflare SSL 模式: **Flexible** (浏览器→CF HTTPS, CF→服务器 HTTP)
- Cloudflare DNS 记录: 两条 A 记录 proxied (🧡 橙色云朵)
- `$http_cf_ray` 检查确保流量来自 Cloudflare

## Cloudflare 配置

| 设置 | 值 |
|------|-----|
| SSL/TLS | Flexible |
| DNS A 记录 | `vorxai.xyz` → VPS IP (Proxied) |
| DNS A 记录 | `vorxprotocol.xyz` → VPS IP (Proxied) |
| 邮件 DNS (MX/SPF/DKIM) | **灰云 DNS only** — 不能 proxy |

## 数据库

### 路径

```
/var/lib/vorx/vorx.sqlite
```

### 备份

```bash
# 备份
cp /var/lib/vorx/vorx.sqlite /var/backups/vorx/vorx-$(date +%Y%m%d-%H%M%S).sqlite

# 直接操作
sqlite3 /var/lib/vorx/vorx.sqlite "SELECT COUNT(*) FROM users;"
```

### 关键表

| 表 | 用途 |
|----|------|
| `users` | 用户账户（含 admin role） |
| `user_assets` | 用户资产余额 |
| `asset_transactions` | 资金流水 |
| `fiat_deposits` | 法币入金记录 |
| `fiat_bank_accounts` | 法币银行账户 |
| `support_messages` | 客服消息 |
| `binary_orders` | 二元期权订单 |
| `positions` | 永续合约持仓 |
| `withdrawals` | 提现记录 |
| `deposits` | 链上充值记录 |
| `kyc_submissions` | KYC 审核 |
| `email_verification_codes` | 邮件验证码 |

## 管理员账号

### 默认管理员

| ID | 账号 | 类型 |
|----|------|------|
| 1 | `admin@example.com` | 邮箱登录 |
| 3 | `qq112211` | 用户名登录 |
| 6 | `qq2233` | 用户名登录 |
| 33 | `qq5158` | 用户名登录 |

### 重置密码

```bash
cd /var/www/vorx
node -e "
const crypto = require('crypto');
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync('NewPassword', salt, 64).toString('hex');
console.log(salt + ':' + hash);
"

# 将输出的 hash 更新到数据库
sqlite3 /var/lib/vorx/vorx.sqlite "UPDATE users SET password_hash='<上一步hash>' WHERE id=1;"
```

无需重启 — 密码 hash 在每次登录时读取。

### 新增管理员

```bash
cd /var/www/vorx
node -e '
const crypto = require("crypto");
const pass = "NewPassword";
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(pass, salt, 64).toString("hex");
const pwhash = salt + ":" + hash;
const {DatabaseSync} = require("node:sqlite");
const db = new DatabaseSync("/var/lib/vorx/vorx.sqlite");
db.prepare("INSERT INTO users (public_uid,username,email,password_hash,role,balance) VALUES (?,?,?,?,?,?)")
  .run("888888","NewAdmin","admin@domain.com",pwhash,"","admin",0);
db.close();
'
```

## 认证系统

- 前台用户 session: `__Host-perp_lab_user_session`
- 后台管理员 session: `__Host-perp_lab_admin_session`
- 密码散列: scrypt (`salt:hash` 格式, 64-byte output)
- CSRF: Origin/Referer header 校验
- 限流: IP + 用户维度

### Email 验证 (Resend)

- 6 位验证码, 5 分钟过期
- 注册验证: `POST /api/auth/send-code` + `POST /api/auth/register`
- 邮箱登录: `POST /api/auth/email-login`
- 忘记密码: `POST /api/auth/send-reset-code` + `POST /api/auth/reset-password`

## 通知系统

### 实时通信

```
用户操作 → API emitRealtime → Socket server :3021 → WebSocket broadcast → Admin 浏览器
                                                      ↓ (fallback)
                                                 10s polling
```

### 通知类型

| 事件 | type | 响铃 | 跳转 |
|------|------|:--:|------|
| 新用户注册 | `user:registered` | ✅ | 用户管理 |
| KYC 提交 | `kyc:created` | ✅ | 身份审核 |
| 链上充值 | `deposit:created` | ✅ | 充值审核 |
| 提现申请 | `withdrawal:created` | ✅ | 提现审核 |
| 法币入金申请 | `fiat_deposit:requested` | ✅ | 法币入金 |
| 用户提交转账 | `fiat_deposit:submitted` | ✅ | 法币入金 |
| 二元下单 | `binary:created` | ✅ | 订单管理 |
| Perp 仓位 | `trade:created` | ✅ | Dashboard |
| 客服消息 | `support_message:created` | ✅ | 客服消息 |

### 声音播放链路

```
通知事件 → alwaysRingTypes.has(type) → playNotificationBell()
  → soundEnabled 检查 → 3s cooldown → mp3 尝试 (2s 超时)
  → speechSynthesis fallback (zh-CN 中文语音)
```

- 需要在页面任意位置**点击一次**解锁浏览器音频 (speechSynthesis prime)
- mp3 文件目录 `public/sounds/admin/` 当前为空，所有通知走 TTS
- console 日志前缀 `[notify]` 方便调试

## 部署检查清单

```bash
# 1. 代码检查
cd /var/www/vorx
git status
npx next build           # 必须 0 错误

# 2. 数据库备份
cp /var/lib/vorx/vorx.sqlite /var/backups/vorx/vorx-$(date +%Y%m%d-%H%M%S).sqlite

# 3. 部署
pm2 restart vorx-next --update-env
pm2 save

# 4. 验证
curl -s -o /dev/null -w '%{http_code}' http://localhost:3020  # 200
curl -s https://vorxai.xyz | head -1                          # HTML
curl -s https://vorxprotocol.xyz/admin | head -1              # HTML

# 5. Socket
curl -s http://localhost:3021/health
```

## 回滚

```bash
cd /var/www/vorx
git log --oneline -5
git checkout <good-commit>

# 重新部署
npx next build
pm2 restart vorx-next --update-env
pm2 save

# 如需恢复数据库
cp /var/backups/vorx/vorx-YYYYMMDD-HHMMSS.sqlite /var/lib/vorx/vorx.sqlite
pm2 restart all
```

## 安全要点

- `SOCKET_INTERNAL_SECRET` / `REALTIME_INTERNAL_SECRET` 必须是非默认长随机值
- 生产环境不能使用 `perp-sim-local-realtime-secret`
- `.env.production.local` 和 `vorx.sqlite` 不可提交到 git
- 仅暴露 80/443 端口；内部服务绑定 127.0.0.1
- Cloudflare 保护前端，管理员域名建议加 Access/防火墙规则
- 邮件 DNS 记录 (MX/SPF/DKIM) 必须灰云 (DNS only)
- `pm2 restart` 必带 `--update-env`
