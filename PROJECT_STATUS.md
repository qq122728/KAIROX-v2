# VORX Protocol — 项目状态

更新时间: 2026-07-09

## 当前部署

- **域名**: `vorxai.xyz` (前台) + `vorxprotocol.xyz` (隐藏后台)
- **服务器**: 单 VPS, PM2 + Nginx + Cloudflare
- **数据库**: SQLite `/var/lib/vorx/vorx.sqlite`
- **最新 commit**: 查看 `git log --oneline -1`

## 已完成功能

### 前台 (vorxai.xyz)

- [x] 登录/注册 (邮箱验证码 + 密码)
- [x] 忘记密码 (邮件重置码)
- [x] 资产概览 (USDC/BTC/ETH/SOL)
- [x] 链上充值 (提交审核)
- [x] 链上提现 (审核流程 + 资金冻结)
- [x] 法币入金 (USD/MYR/GBP/EUR/JPY/TWD, 6 币种)
- [x] 二元期权交易 (Up/Down, 多档位)
- [x] 永续合约 (Perp, 杠杆交易)
- [x] KYC 身份认证 (证件上传 + 审核)
- [x] 内置客服聊天
- [x] 行情数据 (Binance/OKX)

### 后台 (vorxprotocol.xyz/admin)

- [x] Dashboard 概览
- [x] 用户管理 (调余额、重置密码、交易/登录开关)
- [x] 管理员管理 (新增/修改)
- [x] 充值审核 (通过/拒绝 + 证明图片预览)
- [x] 提现审核 (通过/拒绝)
- [x] KYC 审核 (证件预览 + 通过/拒绝)
- [x] 法币入金管理 (发送银行信息 + 确认到账 + 驳回)
- [x] 法币银行账户管理 (多币种 CRUD)
- [x] 二元订单管理 (手动判赢/判输)
- [x] 交易市场管理
- [x] 平台设置 (开关、提现说明、二元档位配置)
- [x] 客服消息 (对话列表 + 回复)
- [x] 资金地址管理 (平台默认 + 用户自定义)

### 通知系统 ✅ (2026-07-09 完工)

- [x] 实时 WebSocket 通知 (10 种事件类型)
- [x] 通知中心面板 (铃铛图标 + 未读计数 + 全部已读)
- [x] 中文语音播报 (speechSynthesis, 浏览器点击解锁)
- [x] 法币入金申请/转账提交通知
- [x] 客服消息通知
- [x] 二元下单/Perp 仓位通知 (所有金额都响铃)
- [x] 声音开关 (localStorage 持久化)
- [x] 3 秒节流 + 去重
- [x] console 日志 (`[notify]` 前缀)

### 实时通信

- [x] Socket.IO 服务 (端口 3021)
- [x] WebSocket → 10s 轮询降级
- [x] 二元期权自动结算 (settlement worker)
- [x] `admin:update` / `user:update` 事件广播
- [x] 内部 emit API (`/internal/emit` + secret)

### Email

- [x] Resend API 集成 (vorxai.xyz 已验证)
- [x] 注册验证码 (6 位, 5 分钟过期)
- [x] 邮箱登录 (无密码)
- [x] 忘记密码 (重置码)

## 已知问题 / 待办

### 高优

- [ ] 前台 Swap 页面为演示状态，未接入真实兑换
- [ ] Perp 交易未完成完整闭环测试
- [ ] 缺少自动化回归测试

### 中优

- [ ] 通知不持久化 (刷新丢失)
- [ ] mp3 音效文件全部缺失 (100% TTS)
- [ ] `deposit:update` 通知跳转到已隐藏的充值审核 tab
- [ ] `withdrawal:created` 双重 emit (用户 API + admin API)
- [ ] `public/sounds/admin/` 目录为空

### 低优

- [ ] 通知持久化到数据库
- [ ] 自定义 mp3 音效
- [ ] 音量控制
- [ ] 通知历史搜索/筛选
- [ ] 图片上传迁移到对象存储 (S3/R2)

## 完成度估算

| 模块 | 完成度 |
|------|:---:|
| 前台移动端 UI/交互 | 85% |
| 后台管理 UI/交互 | 90% |
| 后端 API | 90% |
| 法币入金闭环 | 95% |
| 充值/提现/KYC 审核闭环 | 85% |
| 二元期权下单/结算 | 90% |
| 通知系统 | 100% |
| 实时通信 (Socket) | 95% |
| Email 验证 | 100% |
| 安全生产 (限流/CSRF/安全头) | 85% |
| **总体** | **~90%** |

## 常用命令

```bash
cd /var/www/vorx

# 构建
npx next build

# 部署
pm2 restart vorx-next --update-env && pm2 save

# 查看进程
pm2 status

# 查看日志
pm2 logs vorx-next

# 数据库直接操作
sqlite3 /var/lib/vorx/vorx.sqlite

# API 测试
curl -s http://localhost:3020/api/me
curl -s http://localhost:3021/health
```

## 访问地址

| 页面 | URL |
|------|-----|
| 前台首页 | https://vorxai.xyz |
| 前台登录 | https://vorxai.xyz/login |
| 行情 | https://vorxai.xyz/markets |
| 资产 | https://vorxai.xyz/assets |
| 后台管理 | https://vorxprotocol.xyz/admin |
| 后台登录 | https://vorxprotocol.xyz/admin/login |
