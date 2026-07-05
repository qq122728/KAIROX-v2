# VORX — 深度安全复查报告 v2

**日期**: 2026-07-05
**范围**: 全部34个API端点 + 外部API调用链 + 结算/交易核心逻辑
**上次修复**: settings GET认证 + settle-expired限流

---

## 🟡 P1 — 高危（新增）

### P1-1: 公开行情端点无限流，可放大攻击外部API
**文件**: 
- `app/api/market-data/ticker/route.ts`
- `app/api/market-data/tickers/route.ts`
- `app/api/market-data/klines/route.ts`

**攻击场景**: 这三个端点全部公开无需登录，且无任何限流。每次请求都调用 OKX/Binance 公开API。攻击者并发刷 ticker → OKX/Binance IP限流被触发 → settlement-worker（每5秒调用同一API）无法获取价格 → 二元期权结算全部 fallback 到本地缓存 → 平台核心功能瘫痪。

**验证**: 连续5次请求全部 200，无限流。
```
curl /api/market-data/ticker?symbol=BTC → 200 (hits OKX)
curl /api/market-data/ticker?symbol=BTC → 200 (hits OKX)
... (无限次)
```

**修复**: 对这三个端点加 IP-based 限流（如30次/分钟），或用缓存层避免每次透传外部API

---

## 🔵 P2 — 中危（新增）

### P2-1: 注册无验证码/bot防护
**文件**: `app/api/auth/register/route.ts`
有IP限流（5次/分钟），但无 CAPTCHA。脚本可分布式注册大量账号。
**修复**: 可暂缓，当前IP限流+注册开关已足够防御大部分场景

### P2-2: trade/summary GET 每次轮询触发结算
**文件**: `app/api/trade/summary/route.ts:14-16`
```
try { await settleExpiredBinaryOrders(user.id); } catch {}
```
前端轮询 summary 时自动触发结算。虽已 try-catch 兜底，但高并发时每个用户每次页面刷新都调用完整的结算逻辑（DB查询+外部API），不必要。
**修复**: 可改为前端定时单独调用 settle-expired（已有该端点），或缓存判定

### P2-3: Cookie未用 __Host- 前缀（上次遗留）
**文件**: `lib/auth.ts:5-7`

### P2-4: 内存限流器（上次遗留）
**文件**: `lib/rate-limit.ts`

---

## ⚪ P3 — 低优

- **nginx 443重复 protocol options 警告** — 不影响功能
- **data/ 残留旧 DB** — 可清理

---

## ✅ 本次深度验证通过（新增检查）

| 检查项 | 结果 |
|--------|------|
| 34个端点认证盘点 | 仅login/register/logout/market-data/me为公开端点 ✓ |
| Admin登录 | 独立限流(4次/15min锁) + role验证(非admin拒绝) ✓ |
| 提现密码修改 | 需登录密码 + 当前提现密码双重验证 ✓ |
| 执行价格 | OKX→Binance→cached 三级回退链 ✓ |
| 强平价格计算 | `entryPrice * (1 - 1/leverage + mmr)` 标准公式 ✓ |
| 二元期权结算 | 三重锁: 状态检查 + 过期检查 + UPDATE WHERE status='open' ✓ |
| 外部API调用 | 无API key泄漏，全部公开接口调用 ✓ |
| Admin settings | 独立端点，requireAdmin ✓ |
| Swap限流 | 报价60次/分钟 + 交易30次/分钟 ✓ |
| 注册限流 | IP级别5次/分钟 ✓ |
| 登录限流 | IP+用户名双维度DB持久化 ✓ |
| 充值审批 | tx_hash去重 + 重复处理防护 ✓ |

---

## 📊 汇总

| 级别 | 数量 | 本次新增 | 说明 |
|------|------|----------|------|
| 🔴 P0 | 0 | 0 | — |
| 🟡 P1 | 1 | **1** | 行情端点无限流→外部API放大攻击 |
| 🔵 P2 | 4 | 2 | 注册无验证码、summary自动结算、Cookie前缀、内存限流 |
| ⚪ P3 | 2 | 0 | 旧DB残留、nginx警告 |

**安全评分**: 9.0/10 → P1修完可达 9.5/10
