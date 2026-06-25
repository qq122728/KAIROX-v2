# Review Center Spec

Design reference: `design/review-center.html`.

## Purpose

Review Center unifies 充值审核, 提现审核, and KYC审核 into one consistent review workflow.

It is not three unrelated CRUD pages.

## Shared Layout

All review pages use:

1. Header.
2. Four metric cards.
3. Toolbar.
4. Review table.
5. Hidden right Drawer.

Review decisions happen in Drawer, not table rows.

## Shared Toolbar

All review pages include:

- Search.
- UID/email related search.
- Status filters.
- Time range filter.
- 重置.
- 搜索.

Funds pages additionally support amount range filters.

KYC additionally supports KYC status/document filters.

## Shared Table Behavior

Rules:

- Hover highlight.
- Selected row state.
- `查看` + `更多`.
- Status centered.
- Amounts right aligned.
- Timestamps use `YYYY-MM-DD HH:mm:ss`.

## Deposit Review

Metrics:

- 待审核.
- 今日已通过.
- 今日已拒绝.
- 今日金额.

Table fields:

- 用户.
- 金额.
- 币种.
- 网络.
- TX Hash.
- 提交时间.
- 状态.
- 操作.

Drawer groups:

- 基本信息.
- 审核资料: 截图, TX Hash, 地址, 网络.
- 审核结果: 入账金额, 运营备注.

Drawer footer:

- 拒绝.
- 通过.

## Withdrawal Review

Metrics:

- 待审核.
- 今日已通过.
- 今日已拒绝.
- 今日提现金额.

Table fields:

- 用户.
- 金额.
- 币种.
- 提现地址.
- 提交时间.
- 状态.
- 操作.

Drawer groups:

- 基本信息.
- 审核资料: 提现地址, 金额, 手续费, 备注.
- 审核结果: 资金影响, 拒绝原因/运营备注.

Drawer footer:

- 拒绝.
- 通过.

## KYC Review

Metrics:

- 待审核.
- 今日通过.
- 今日拒绝.
- 通过率.

Table fields:

- 用户.
- 姓名.
- 国家.
- 证件类型.
- 提交时间.
- 状态.
- 操作.

Drawer groups:

- 基本信息.
- 审核资料: 身份证正面, 身份证反面, 自拍照, 国家, 姓名, 证件号码.
- 审核结果: 通过后状态, 拒绝原因/运营备注.

Drawer footer:

- 拒绝.
- 通过.

## Review Statuses

- 待审核: orange.
- 已通过: green.
- 已拒绝: red.
- 处理中: blue.

