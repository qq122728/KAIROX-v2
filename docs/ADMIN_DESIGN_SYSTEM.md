# VORX Admin Design System

This document is the source of truth for the VORX admin console design language. All future admin pages must follow this system unless a later design document explicitly supersedes it.

## Product Direction

VORX admin is an Operations Console for a trading platform. It is not a generic admin template and not a CRUD table collection.

The console should help operators answer three questions quickly:

- What needs action today?
- Is the platform healthy?
- Where is the risk?

The visual references are Stripe Dashboard for layout discipline, Linear for information hierarchy, Hyperliquid for trading professionalism, Binance Admin for operations workflows, and Apple for spacing and material restraint.

## Language

- All visible admin UI copy must be Chinese.
- Database names, API fields, TypeScript names, and internal identifiers can stay English.
- Avoid mixed labels such as `Binary Orders` in the UI. Use `二元订单`.

## Page Templates

The admin console uses four page templates.

| Template | Used For | Structure |
| --- | --- | --- |
| Dashboard | 运营总览 | Header, hero metrics, operation todos, system status, activity/risk panels |
| List + Drawer | 用户、审核、交易 | Header, metric cards, toolbar, table, hidden right Drawer |
| Configuration | 市场管理、系统设置 | Header, metric cards, configuration table, hidden right Drawer, explicit save |
| Monitor | 通知中心、风控中心 | Header, event streams, severity grouping, timeline/details Drawer |

## Global Layout

- Left sidebar width: 268px desktop.
- Main header height: 88px.
- Main content padding: 30px 32px 36px.
- Page content uses a 20px vertical rhythm.
- Primary content is always the list/table unless the page is Dashboard.
- Right Drawer is hidden by default and slides in only after row action.

## Sidebar

Sidebar groups:

- 运营中心: 首页, 通知中心
- 用户管理: 用户, 资金
- 审核中心: 充值审核, 提现审核, KYC审核
- 交易中心: 二元订单, 永续持仓
- 系统: 市场管理, 系统设置

Rules:

- Use grouped navigation, not a flat menu.
- Active item uses dark blue selected state and Lucide icon.
- Labels are Chinese.

## Header

Every page header includes:

- Page title.
- Short operational description.
- Realtime status.
- Last sync time.
- Notification button.
- Admin avatar.

Dashboard additionally includes Socket, Settlement Worker, API, and database status in a more prominent console header.

## Metrics

Metrics follow the Stripe-style hierarchy:

- Number is first visual.
- Label is weak.
- Helper text is lighter than label.
- Use tabular numbers.
- Cards are short and light, not bulky.

Metric card guidance:

- Height: 112px for list/configuration pages.
- Border radius: 17px.
- Do not use heavy borders or strong shadows.
- Do not add decorative charts inside metric cards.

## Toolbar

Toolbars should feel like GitHub/Linear/Stripe filtering, not traditional forms.

Rules:

- Search is a rounded pill input.
- Filters are pill buttons, not select-heavy forms.
- Keep `重置` and `搜索` at the right edge when space allows.
- Avoid multi-row form labels.
- Use short filter names: `全部`, `待审核`, `大额`, `冻结`, `高风险`.

## Tables

Tables are the main work surface.

Rules:

- Use separated rows with 8px vertical spacing.
- Row background: soft dark.
- Hover: slightly lighter row background.
- Selected row: subtle blue background and border.
- Amount columns are right aligned.
- Status columns are centered.
- Email/user columns are left aligned.
- Use tabular numbers everywhere numeric values appear.
- Table actions stay minimal: `查看` + `更多`.

Do not place dangerous operations directly in table rows.

## Drawer

Drawer is the standard detail and action surface.

Rules:

- Default hidden.
- Width: 420px to 460px; standard is 440px.
- Opens from the right.
- Contains grouped blocks with clear headings.
- Dangerous operations go in the final block or fixed footer.
- Drawer actions are explicit and never silent.

Common Drawer groups:

- 基本信息
- 业务详情 / 审核资料 / 配置内容
- 流水 / 日志
- 风险信息
- 危险操作

## Actions

Low-risk table action:

- `查看`
- `更多`

Dropdown candidates:

- 查看详情
- 资金
- 安全
- 交易记录
- 登录记录
- 权限
- 备注
- 历史记录
- 查看日志

High-risk actions must be moved into Drawer:

- 上下分
- 修改密码
- 人工结算
- 强平
- 关闭交易
- 关闭充值
- 关闭提现
- 维护模式

High-risk actions require confirmation copy and visible effect summary.

## Status Colors

Use the same status language and colors across all pages.

| State | Chinese Label | Color |
| --- | --- | --- |
| Active / normal / approved / profitable | 开启, 正常, 已通过, 已盈利 | Green |
| Pending / awaiting action | 待审核, 待结算, 待处理 | Orange |
| Running / processing | 运行中, 处理中, 开放 | Blue |
| Risk / rejected / loss / frozen | 已拒绝, 已亏损, 冻结, 高风险 | Red |
| Disabled / canceled / off | 禁用, 已取消, 关闭, 未提交 | Gray |
| Maintenance | 维护 | Orange |

## Save Behavior

Configuration pages never silently save.

Flow:

1. User edits in Drawer.
2. Drawer shows `● 未保存修改`.
3. User clicks `保存`.
4. Drawer shows `✓ 已保存`.

Dangerous settings require a second confirmation.

## Component Families

All pages use:

- Lucide icons only.
- Soft dark panels.
- Metric cards.
- Filter toolbar.
- Separated table rows.
- Status chips.
- Right Drawer.
- Explicit save/confirm buttons.

## Accessibility And Interaction

- Click targets should be at least 36px for table actions and 38px for header buttons.
- Drawer close button must be clearly available.
- Status should not rely only on color; visible labels are required.
- Hover and selected states should be visible but subtle.
- Future keyboard support should preserve row focus, Drawer focus trap, and escape-to-close behavior.

