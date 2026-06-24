# VORX Protocol — Funds System Final Audit

> **Generated:** 2026-06-25
> **HEAD:** `2b47b78` (tag `frontend-audit-clean`)
> **Branch:** `master` (up to date with `origin/master` on GitHub)
> **Audit scope:** Backend funds subsystem — user balances, deposits, withdrawals, swap, ledger, admin authz, idempotency / race, DB transactions, user-side IDOR.
> **Methodology:** 8 parallel reviewers, each finding adversarially verified by 2 independent skeptics (refute lens + reproduce lens); only findings that survived both verifications were retained. 36 raw findings → 33 deduped issues.

---

## 1. 项目状态

**Ready For Backend Development.**

前端审计 (`docs/2026-06-ui-refactor-audit-fix-plan.md`) 列出的 P0 / P1 项已全部关闭。`npm run lint` 与 `npm run build` 均通过，工作树干净，已同步 `origin/master`。

本次新一轮**后端资金系统**多 Agent 审查产出 33 条 finding，**不作为本里程碑的修复目标**，而是按"真问题 / 未来优化 / 暂不处理"分类，作为后端开发阶段的工单输入留档。

---

## 2. 已完成修复（A–E 批次）

| 批次 | 主题 | 关键 commit | 说明 |
|---|---|---|---|
| **A** | 数据一致性 + 注册字段提交 | 滚入 baseline `6b55567` | TradeTab favorites 提升到全局 / 删除 `flux:fav-markets` 旧 key / 注册补发 nickname + invite / 清理 `seenSettledIds` 死状态 |
| **B** | iOS / PWA / 触控 | `41119ca` | 表单 input 字号统一 16px (防 iOS 聚焦放大) / PWA 192·512·1024 三套图标 / `100vh→100dvh` 回退 / `max-width:100vw→100%` / `-webkit-backdrop-filter` 前缀 / `.sheet-close .ml-star .auth-input-eye` 热区扩到 ≥44×44 |
| **C** | 可访问性 | `13ef20f` | 全局 `:focus-visible` 蓝圈 / 5 个 modal 加 `role=dialog aria-modal aria-labelledby` + Esc 关闭 / 全部非 submit `<button>` 补 `type="button"` / Home + Markets 嵌套 button 改 `div role=button` / 输入框 aria-label / 底部导航 `aria-current="page"` + `<nav aria-label="Primary">` / Toast `role="status" aria-live` |
| **D** | 安全加固 | `c4b73d7` | `/api/auth/register` IP 限速 / `/api/assets/swap` 用户限速 + `settings.trading_enabled` + `users.trading_enabled` 双门 / `/api/auth/withdrawal-password` 必须验证登录密码 |
| **E** | 死代码 / CSS / 性能清理 | `7a79a53` | 删除 `UserIdenticon` / `identiconPalette` / `hashSeed` / `Wallet` lucide 引入 / `TermsPage.onAgree` 不可达分支 / 同步删除 6 条孤儿 CSS / `openOrders / history / currentMarket / activeOrder` 包 `useMemo` / `showToast` setTimeout 走 `useRef` + unmount 清理 |
| post-E | Landing 比例 | `543a0ca` | Logo 缩小 ~50%、CTA 50px / 17px / weight 700 |
| post-E | Swap 取整漏洞 P0 | `77ab05b` | `lib/swap.ts` 零扣款 rounding exploit 修复 |
| post-E | P1 收尾 | `2b47b78` | 余下 P1 项目集中处理（含 swap 报价端鉴权 + 限速、withdraw 路径加固、binary-orders 校验、UI 微调） |

---

## 3. 已修复 P0（前端审计计划 `docs/2026-06-ui-refactor-audit-fix-plan.md` 中的 P0）

| ID | 简述 | 关闭于 |
|---|---|---|
| P0-1 | TradeTab favorites 重复状态 → 全局收敛、删除旧 key `flux:fav-markets` | A · `6b55567` |
| P0-2 | 注册表单 nickname / invite 静默丢弃 → 已传至 API 并落库 | A · `6b55567` |
| P0-3 | iOS Safari 聚焦输入框自动放大 (font-size < 16px) | B · `41119ca` |
| P0-4 | PWA manifest 仅声明 1024×1024，Android 无法安装 | B · `41119ca` |
| P0-5 | 17 处 `outline: none` 无 `:focus-visible` 兜底 → 键盘无焦点提示 | C · `13ef20f` |
| P0-6 | 5 个 modal 缺 `role="dialog" aria-modal aria-labelledby` + Esc 关闭 | C · `13ef20f` |
| P0-7 | 三套竞争的 `:root` 调色板 / 颜色 token 漂移 | 2b47b78 (token 收敛) |
| P0-8 | Order tag 仍使用旧霓虹色 → 与 Soft Dark 视觉冲突 | 2b47b78 (palette pass) |
| P0-9 | `load()` 轮询闭包捕获过期 `currentSymbol` | 2b47b78 (重写依赖) |
| P0-10 | Toast `setTimeout` 无引用 → 连发覆盖 + 卸载警告 | E · `7a79a53` |
| extra | Swap 小额取整零扣款绕过 | `77ab05b` |

---

## 4. 已修复 P1（前端审计计划中的 P1）

仅列出代表性项，详细对照见 `docs/2026-06-ui-refactor-audit-fix-plan.md` 第 4 节。

**Security (P1-S 系列):** `41119ca` / `c4b73d7` / `2b47b78` 联合关闭
- P1-S1 Swap POST 速率限制
- P1-S2 Swap 绕过 trading_enabled
- P1-S3 register 速率限制
- P1-S4 修改提现密码不需要登录密码

**Mobile UX (P1-M 系列):** B 批次 `41119ca`
- 44×44 触控目标 / dvh 回退 / 100vw 横向滚动 / `-webkit-backdrop-filter` / pinch-zoom

**A11y (P1-A 系列):** C 批次 `13ef20f`
- `type="button"` / 嵌套 button / `aria-label` / `aria-current` / Toast aria-live / `aria-pressed`

**React Perf (P1-R 系列):** E 批次 `7a79a53`
- `useMemo` 包裹热路径 / Toast setTimeout 引用化 / 死代码减少 re-render

**confirmed clean:** 当前 `master` 上**无剩余前端 audit plan 的 P0、无剩余 P1**。

---

## 5. 剩余问题（后端资金审查 — **真问题**）

> 以下问题是本次多 Agent 后端审查输出，**未在本里程碑内修复**。是后端开发阶段的工单输入。
> 计 25 条（4 P0 + 16 P1 + 5 P2）。

### 5.1 P0 — 直接资金损失 / 双重入账（**必须修，且建议在开放真实存款前完成**）

| # | 标题 | 位置 |
|---|---|---|
| F-P0-1 | `tx_hash` 唯一索引采用 `(tx_hash, asset, network)` 复合键 → 同一链上 tx 可对多 (asset, network) 重复入账 | `lib/db.ts:454` |
| F-P0-2 | `/api/assets/withdraw` 无任何速率限制 → 提现 PIN 可在线暴力 | `app/api/assets/withdraw/route.ts:19-43` |
| F-P0-3 | `/api/admin/users` PATCH 不阻止 admin 给自己加余额或把任意账户提升为 admin；`requireAdmin()` 返回值被丢弃、`asset_transactions` 无 actor 列 | `app/api/admin/users/route.ts:35-107` |
| F-P0-4 | `/api/admin/positions` PATCH 可强平自己持仓，`pnlOverride` 无界 + 整个流程不写 `asset_transactions`（结合 `/api/admin/markets` 价格可改写，构成完整的造币-销证迹链路） | `app/api/admin/positions/route.ts:7-81` |

### 5.2 P1 — 重大安全 / 完整性缺陷

| # | 标题 | 位置 |
|---|---|---|
| F-P1-1 | `syncUserStableBalance` 只镜像可用余额，`users.balance` 静默排除 `locked` USDC | `lib/balances.ts:52-63` |
| F-P1-2 | `/api/admin/summary` 的 `total_assets` / `total_stable_balance` 忽略 `user_assets.locked` | `app/api/admin/summary/route.ts:16,81` |
| F-P1-3 | `network` 字段未做大小写归一化 → tx_hash 唯一索引可被绕过 | `app/api/assets/deposits/route.ts:33-36`、`lib/db.ts:481-486` |
| F-P1-4 | 存款 POST 无速率限制；`tx_hash=null` 不进 partial unique；2 MB base64 直接入库 → 存储 DoS | `app/api/assets/deposits/route.ts:27-79` |
| F-P1-5 | 管理员审批存款时金额无上限，SELECT 行在事务外读取，证明文件可为空 | `app/api/admin/deposits/route.ts:25-60` |
| F-P1-6 | 模拟回退价 `FALLBACK_USD_PRICE` 在双源失败时被照常使用 → 跨期套利 | `lib/swap.ts:10-49` |
| F-P1-7 | Perp 持仓开 / 平改写 USDC 余额但**完全不写** `asset_transactions` 账本 | `app/api/trade/positions/route.ts:38-125` |
| F-P1-8 | 存款被拒绝时遗留 pending `deposit_request` 账本行，永不更新 | `app/api/assets/deposits/route.ts:60-71` |
| F-P1-9 | 管理员冻结 / 解冻在账本中写入 ±amount，与真实出入金不可区分 | `app/api/admin/users/route.ts:74-101` |
| F-P1-10 | Swap 手续费被静默吸收，账本无 `swap_fee` 行 | `lib/swap.ts:141-158` |
| F-P1-11 | 管理员强平账本审计缺失（无 actor、无 `asset_transactions` 行） | `app/api/admin/positions/route.ts:42-71` |
| F-P1-12 | 管理员余额调整未记录操作人（`asset_transactions` 表本身无 actor 列） | `app/api/admin/users/route.ts:99-102` |
| F-P1-13 | 提现 approve / payment / reject 不记录批准管理员，且未阻止 admin 自审 | `app/api/admin/withdrawals/route.ts:78-137` |
| F-P1-14 | 管理员可在二元订单到期前预设结果，且无 actor 审计 | `app/api/admin/orders/route.ts:5-21` |
| F-P1-15 | 管理员存款地址 POST/PATCH/DELETE 无操作人审计，单次 `ON CONFLICT` 即可改写平台默认地址 | `app/api/admin/deposit-addresses/route.ts:54-130` |
| F-P1-16 | `/api/assets/withdraw` 未检查 `users.trading_enabled` 与 `kyc_status` → admin 冻结在提现路径上变 no-op | `app/api/assets/withdraw/route.ts:19-70` |

### 5.3 P2 — 应修

| # | 标题 | 位置 |
|---|---|---|
| F-P2-1 | Binance USDT 价被当作 USDC 价使用 → USDT 脱锚时构成稳定套利 | `lib/swap.ts:42-48` |
| F-P2-2 | 管理员可控 `note` 越过 PII 脱敏器进入用户账本（提现 + binary settle） | `app/api/admin/withdrawals/route.ts:62-124`、`lib/binary-settlement.ts:115-116` |
| F-P2-3 | 接受非稳定资产 (BTC/ETH/SOL) 存款时不强制证明，且 USDT 静默重写为 USDC | `app/api/assets/deposits/route.ts:8-71` |
| F-P2-4 | `/api/kyc` 与 `/api/assets/deposits` 接受 2 MB 文件上传且无速率限制 | `app/api/kyc/route.ts:25-55` |
| F-P2-5 | `/api/admin/summary` 一次返回所有 KYC 证件与存款凭证 base64 | `app/api/admin/summary/route.ts:42-99` |

---

## 6. 不准备修复的问题及原因

### 6.1 未来优化（**post-launch hardening / 等真实流量再说**）

| # | 标题 | 不在本期修的原因 | 位置 |
|---|---|---|---|
| FO-1 | `inTransaction` 使用 `BEGIN`（DEFERRED）→ 并发写入升级竞态 | 当前所有热路径的余额扣减均有 `WHERE balance >= ?` 条件 UPDATE 兜底，未触发实际错账；只是失去防御纵深。后端开发期把 `BEGIN IMMEDIATE` + busy_timeout 提升一并改 | `lib/db.ts:507-518` |
| FO-2 | `requireAdmin` 回退到 `LEGACY_SESSION_COOKIE` | 当前 admin 登录会清除 legacy cookie；只有历史迁移残留 + 攻击者已拿到管理员 cookie 才有效；优先级低于真问题 | `lib/auth.ts:70-98` |
| FO-3 | `/api/binary-orders/settle-expired` 无限速 | 已被 socket 后台 worker 实际承担结算；预计未来直接下线该 user-面端点 | `app/api/binary-orders/settle-expired/route.ts` |
| FO-4 | 用户平仓 payout 基于事务外读取的 mark_price | 攻击者只能"挑选"早一个写锁的报价，并非自由择优；放到流量上来再补 | `app/api/trade/positions/route.ts:78-113` |
| FO-5 | `/api/settings` GET 公开返回完整设置表 | 当前 settings 内容均是公开运营文案；待后端有敏感键时再做投影 | `app/api/settings/route.ts:7-13` |
| FO-6 | Swap 手续费小额四舍五入为 0 → 切单逃费 | 仅收入侧损失，非用户资金安全；等实际打点数据再决定最小名义/最小费 | `lib/swap.ts:98-99` |
| FO-7 | 管理员创建提现时 `amount` 与 USD 计价的 `min_withdrawal` 直接比较 | admin-only 路径，触发需要 admin 主动违规；F-P0-3 一旦修复后影响更小 | `app/api/admin/withdrawals/route.ts:36-37` |

### 6.2 暂不处理（**本期工程性 won't-fix**）

| # | 标题 | 原因 |
|---|---|---|
| WF-1 | 提现密码错误信息预言机（"Invalid withdrawal password" vs "Insufficient available balance"） | 一旦 F-P0-2（withdraw 速率限制）修复，预言机即被节流压制；单独再做错误信息归并的边际收益低，且会降低用户排错体验 |

---

## 7. 上线前建议

按风险优先级，建议在**真实存款 / 真实资金开放给用户**之前完成下列工作：

### 必须 (Blockers)

1. **关闭后端 P0**：F-P0-1（tx_hash 索引修正 + 跨行去重）、F-P0-2（withdraw 限速）、F-P0-3（admin 自我操作禁止 + 角色变更门控）、F-P0-4（admin 强平 self-check + pnlOverride 钳制 + 强制账本行）。
2. **统一管理员操作审计**：给 `asset_transactions / withdrawals / binary_orders / orders / deposit_addresses` 加 `actor_id`（统一对应 P1-11/12/13/14/15），所有管理员路由从 `requireAdmin()` 返回值写入。无审计的内部威胁无法事后定位。
3. **账本完整性**：补 perp_open/perp_close（F-P1-7）、swap_fee（F-P1-10）、admin force-close 行（F-P1-11）；rejected 存款的 pending 行需在拒绝时同步更新（F-P1-8）；冻结/解冻拆出独立 type（F-P1-9）。
4. **余额口径统一**：选择 `users.balance` 与 `user_assets` 之一作为唯一真实源（F-P1-1）；admin summary 计入 `locked`（F-P1-2）。
5. **PII / 大对象 hardening**：admin/summary 不再返回 base64 影像（F-P2-5）；改文件落地 + 引用；kyc / deposit 上传加限速（F-P2-4）。
6. **价格源安全**：fallback 价拒绝兑换（F-P1-6）；USDT vs USDC 计价区分（F-P2-1）。

### 推荐 (Strongly Recommended)

- 引入 `admin_audit` 表 + UI（关联 F-P1-12/15）。
- `BEGIN IMMEDIATE` + 5s busy_timeout + busy-retry 包裹器（FO-1）。
- 移除 `LEGACY_SESSION_COOKIE` 对 admin scope 的回退（FO-2）。

### 可观察后再决 (Defer with monitoring)

- swap fee 最小额下限（FO-6）。
- `/api/settings` 投影（FO-5）。
- `settle-expired` user-面端点下线（FO-3）。

---

## 8. Git 提交时间线

```
2b47b78 fix: address final P1 audit issues                       ← HEAD, tag: frontend-audit-clean
77ab05b fix: prevent zero-deduction swap rounding exploit
543a0ca fix: tighten mobile landing page proportions
7a79a53 chore: prune dead code, orphan css and memoize hot derivations    (Batch E)
c4b73d7 fix: harden api with rate limits and password gates              (Batch D)
6929558 fix: polish mobile auth keyboard layout
13ef20f fix: improve accessibility basics                                (Batch C)
41119ca fix: improve mobile iOS PWA and touch targets                    (Batch B)
6b55567 VORX Protocol rebrand: 5-tab IA, Swap, Landing, PWA, audit plan  (Batch A 滚入此 baseline)
6e8fd23 Premium auth, market selector, assets dashboard, order sheet, deposit flow
67b9b93 Initial snapshot: working dev setup with responsive deferred
```

---

## 9. 当前版本信息

| | |
|---|---|
| **Branch** | `master` |
| **HEAD** | `2b47b78` |
| **Tag** | `frontend-audit-clean` |
| **Remote** | `origin` → `https://github.com/qq122728/VORXv1.git` |
| **Sync** | ✅ `master` 已同步 `origin/master` |
| **`npm run lint`** | ✅ 通过 |
| **`npm run build`** | ✅ 通过 |
| **剩余前端 audit P0** | 0 |
| **剩余前端 audit P1** | 0 |
| **后端审查 finding (open)** | 25 真问题 + 7 未来优化 + 1 暂不处理 = 33 |

---

## 项目当前状态

> **Ready For Backend Development**

前端 audit 闭环完成；后端资金系统已通过 8 维多 Agent + 双 skeptic 对抗验证审查，33 条 finding 已分类归档为后端阶段工单。继续后端开发时请以本文件第 7 节"上线前建议"为准。
