# Dashboard Spec

Dashboard is the operating home of the admin console. It answers what needs attention, whether the platform is healthy, and where risk exists.

Design reference: `design/dashboard.html`.

## Purpose

Dashboard is not a data report page. It is the first screen for daily operations.

Primary goals:

- Show core business numbers.
- Surface pending operations.
- Show platform service health.
- Highlight recent funds activity and risk events.

## Header

Header contains:

- VORX brand mark.
- `运营控制中心`.
- Realtime state.
- Socket.
- Settlement Worker.
- API.
- Last sync time.
- Notification center.
- Admin avatar.

## First Visual: Core Metrics

Use an asymmetric hero layout, not a grid of equal cards.

Primary metric:

- 平台总资产

Secondary metrics:

- 总用户
- 在线用户
- 今日交易额
- 开放风险

Rules:

- Number is the dominant visual.
- Labels are weak.
- Helper text is muted.

## Second Visual: Operation Todos

This is the most important operational section.

Todo cards:

- 待审核充值
- 待审核提现
- 待审核 KYC
- 大额订单

Each item includes:

- Count.
- Operational explanation.
- `立即处理 →`.
- Status color.

## Third Visual: Platform Status

Service cards:

- Socket
- 结算服务
- API
- 数据库

Each service displays:

- Current status.
- Last heartbeat or sync time.

States:

- 正常: green.
- 异常: red.
- 维护: orange.

## Fourth Visual: Activity And Risk

Use two equal-height panels:

- 最近资金流水.
- 风险事件.

Recent funds fields:

- 用户.
- 类型.
- 金额.
- 时间.

Risk event fields:

- Event title.
- Context.
- Severity chip.

## Interaction Rules

- Clicking todo cards navigates to corresponding List + Drawer pages.
- Clicking risk events opens the future risk Drawer or risk page.
- Notification center opens from header.
- No high-risk actions on Dashboard.

