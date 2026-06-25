# Trading Center Spec

Design reference: `design/trading-center.html`.

## Purpose

Trading Center unifies 二元订单 and 永续持仓 with one operations model.

Operators should quickly inspect orders, positions, risk, and manual actions while avoiding accidental settlement or liquidation.

## Shared Layout

Both pages use:

1. Header.
2. Metric cards.
3. Toolbar.
4. Table.
5. Hidden right Drawer.

Manual settlement and liquidation are Drawer-only operations.

## Binary Orders

Metrics:

- 运行中订单.
- 待结算订单.
- 今日结算.
- 今日成交金额.
- 今日盈亏.

Toolbar:

- Search by 邮箱 / UID / 交易对 / 订单号.
- CALL.
- PUT.
- 状态.
- 时间范围.
- 金额范围.
- 重置.
- 搜索.

Table fields:

- 用户.
- 交易对.
- 方向.
- 投入金额.
- 到期时间.
- 当前状态.
- 结算结果.
- 创建时间.
- 操作.

Statuses:

- 运行中: blue.
- 待结算: orange.
- 已盈利: green.
- 已亏损: red.
- 已取消: gray.

Drawer groups:

- 基本信息.
- 订单信息: 交易对, 方向, Entry Price, Current Price, Settlement Price, Stake, Potential Return, Profit.
- 资金流水: Asset Ledger, 订单流水.
- 人工结算: Settlement Result, 影响余额, 操作人, 最后更新时间, 运营备注.

Drawer footer:

- 设为亏损.
- 取消.
- 设为盈利.

## Perpetual Positions

Metrics:

- 开放仓位.
- 已平仓.
- 强平数量.
- 总保证金.
- 未实现盈亏.

Toolbar:

- Search by 邮箱 / UID / 交易对 / 持仓号.
- 方向.
- 杠杆.
- 状态.
- 时间范围.

Table fields:

- 用户.
- 交易对.
- 方向.
- 保证金.
- 杠杆.
- 开仓价格.
- 标记价格.
- 未实现盈亏.
- 强平价格.
- 状态.
- 操作.

Drawer groups:

- 基本信息.
- 持仓详情: 保证金, 杠杆, 开仓价, 标记价, 当前价格, 未实现盈亏, 资金费, 手续费.
- 订单与资产流水.
- 风险信息: 保证金率, 强平价, 风险等级.
- 危险操作: 强平, 运营备注, 操作日志.

Drawer footer:

- 取消.
- 强平持仓.

## Trading Statuses

- 盈利: green.
- 亏损: red.
- 运行中 / 开放: blue.
- 待处理 / 风险关注: orange.
- 已取消 / 已关闭: gray.

