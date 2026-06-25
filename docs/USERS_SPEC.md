# Users Page Spec

Design reference: `design/users.html`.

## Purpose

Users is an operations workbench. It helps operators quickly find users, inspect account state, and enter money/security/trading management without accidental high-risk actions.

## Layout

Structure:

1. Header.
2. User metric cards.
3. Toolbar.
4. Full-width user table.
5. Right Drawer hidden by default.

Drawer does not occupy page width until opened.

## Metrics

Cards:

- 今日新增用户.
- 在线用户.
- KYC 通过率.
- 平台总资产.

Metric rules:

- Number is first visual.
- Label is weak.
- Helper text is light.
- Keep card height compact.

## Toolbar

Toolbar contains:

- Search by 邮箱 / UID / 用户名.
- Filters: 全部, 正常, 待审核, 冻结, 禁用, 禁止交易, 禁止登录.
- 重置.
- 搜索.

Rules:

- Avoid traditional form layout.
- Prefer pill filters.

## User Table

Fields:

- 用户: weak avatar, email, UID.
- KYC.
- 账户状态.
- 总资产.
- 可用余额.
- 冻结余额.
- 最后登录.
- 注册时间.
- 操作.

Alignment:

- Email left.
- UID left.
- Amounts right.
- Status centered.
- Actions right.

Row behavior:

- Hover highlight.
- Selected state.

## Actions

Visible actions:

- 查看.
- 更多.

Dropdown options:

- 资金.
- 安全.
- 交易记录.
- 登录记录.
- 权限.
- 备注.

No high-risk operation appears directly in table.

## Drawer

Default: hidden.

Width: 440px.

Groups:

- 基本信息.
- 资金信息.
- 账户状态.
- 风险操作.

## Funds Operation

Funds operation appears only in Drawer.

Flow:

1. 操作前余额.
2. 调整金额.
3. 操作后余额.
4. 运营备注.
5. 确认摘要.

The operation must clearly show impact before confirmation.

