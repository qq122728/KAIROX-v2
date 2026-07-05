# VORX — 安全复查报告

**项目路径**: `/var/www/vorx`
**审查日期**: 2026-07-05
**上次修复**: handleError + Nginx安全响应头

---

## 🟡 P1 — 高危

### P1-1: /api/settings GET 无需认证，公开暴露全部平台配置
**文件**: `app/api/settings/route.ts:11`
**攻击场景**: 任何人无需登录即可访问 `/api/settings`，获取所有平台设置（WhatsApp/Telegram链接、注册开关、提现开关、二元期权配置等）
**修复**: GET 方法加 `requireUser()` 或至少对敏感字段脱敏

### P1-2: /api/binary-orders/settle-expired 无限流
**文件**: `app/api/binary-orders/settle-expired/route.ts`
**攻击场景**: 任何已登录用户可无限次调用结算接口，触发 DB 查询 + 外部 API 调用（OKX/Binance），可造成资源消耗
**修复**: 添加 `consumeUserRate(user.id, "settle-expired", ...)` 限流

---

## 🔵 P2 — 中危

### P2-1: settle-expired 应限制为内部调用
**文件**: `app/api/binary-orders/settle-expired/route.ts`
当前任何登录用户都可以触发结算。设计上应仅由 settlement-worker 调用。
**修复选项**:
- A) 改为检查内部 SOCKET_INTERNAL_SECRET（与 settlement-worker 共用），完全禁止外部用户调用
- B) 保持现状但加强限流（P1-2）

### P2-2: Cookie 未用 __Host- 前缀
**文件**: `lib/auth.ts:5-7`
当前 cookie 名：`perp_lab_user_session`, `perp_lab_admin_session`
子域名可覆写这些 cookie。标准的 __Host- 前缀会阻止子域名设置。
**修复**: 改为 `__Host-perp_lab_user_session`（需同时确认所有 path=/ 且无 domain 属性）

### P2-3: 内存限流器
**文件**: `lib/rate-limit.ts`
Map-based 限流，进程重启后清空，多实例不共享
**修复**: 非紧急，当前单实例够用。将来多实例部署时迁移到 DB 或 Redis

---

## ⚪ P3 — 低优

- **Nginx 443 block 有多处重复 protocol options 警告** — 不影响功能
- **`data/vorx.sqlite`** 残留旧 DB 文件（实际使用 `/var/lib/vorx/vorx.sqlite`）— 可清理
- **admin:join WS 事件** 可被非管理员尝试（已被服务端拒绝）— 低风险信息收集

---

## ✅ 已验证安全的项目

| 检查项 | 结果 |
|--------|------|
| 密码存储 | scrypt + 随机salt + timingSafeEqual ✓ |
| WebSocket认证 | session cookie校验 + timingSafeEqual内部secret ✓ |
| WebSocket房间隔离 | `user:${id}` 房间绑定 + admin房间需role验证 ✓ |
| CSRF | requireSameOrigin → readJson 自动调用 ✓ |
| SQL注入 | 全参数化 ? 占位符 ✓ |
| 管理员接口 | 所有admin路由 requireAdmin ✓ |
| 管理员自操作防护 | 不能自己改余额/角色 ✓ |
| 提现安全 | 二次密码验证 + 金额下限 + 限流 ✓ |
| 二元期权下单 | 金额10-5000限制 + 限流 ✓ |
| 充值审批 | tx_hash去重 + 重复处理防护 ✓ |
| KYC图片 | requireAdmin鉴权 ✓ |
| 密码修改 | 需当前密码验证 + scrypt ✓ |
| 登录限流 | IP+用户名双维度 + DB持久化 ✓ |
| Nginx CF-Ray | 全部server block ✓ |
| Nginx安全头 | X-Frame-Options, CSP, HSTS等 ✓ (本次修复) |
| error泄漏 | 生产环境统一返回 "Internal server error" ✓ (本次修复) |
| X-Powered-By | 已隐藏 ✓ (本次修复) |
| 硬编码密钥 | 无发现 ✓ |
| NEXT_PUBLIC_暴露 | 仅安全值（URLs、阈值）✓ |

---

## 📊 总结

| 级别 | 数量 | 关键项目 |
|------|------|----------|
| 🔴 P0 | 0 | - |
| 🟡 P1 | 2 | settings公开暴露、settle-expired无限流 |
| 🔵 P2 | 3 | settle-expired应内部调用、Cookie前缀、内存限流 |
| ⚪ P3 | 3 | 重复nginx警告、残留DB文件、WS信息收集 |

**安全评分**: 8.5/10 → 接近生产级
**上次P1修复**: ✅ handleError ✅ 安全响应头
**新增P1**: settings GET无认证暴露、settle-expired缺限流
