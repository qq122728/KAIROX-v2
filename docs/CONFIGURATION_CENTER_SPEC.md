# Configuration Center Spec

Design reference: `design/configuration-center.html`.

## Purpose

Configuration Center is the platform control center for markets and system settings. It is not a traditional form page.

Operators should be able to inspect configuration, edit parameters, see unsaved changes, and avoid accidental dangerous switches.

## Shared Layout

Markets and Settings use:

1. Header.
2. Metric cards.
3. Toolbar.
4. Configuration table.
5. Hidden right Drawer.

All edits happen in Drawer. All saves are explicit.

## Save Model

Required flow:

1. User edits value in Drawer.
2. Drawer top shows `● 未保存修改`.
3. User clicks save button in Drawer footer.
4. Drawer top shows `✓ 已保存`.

No silent save.

## Markets

Metrics:

- 交易对数量.
- 已启用.
- 已停用.
- Binary 市场.
- Perpetual 市场.

Toolbar:

- Search by 交易对.
- 状态.
- 市场类型.
- 排序.
- 重置.
- 搜索.

Table fields:

- 交易对.
- 市场类型.
- 当前价格.
- 手续费.
- 杠杆.
- 状态.
- 最后修改时间.
- 操作.

Drawer groups:

- 基础信息: 交易对, 市场类型, 状态.
- 交易参数: 手续费, 最小下单, 最大下单, 最小价格精度, 数量精度.
- 永续参数: 最大杠杆, 维持保证金, 强平比例, 资金费率.
- 状态: 启用, 暂停交易, 隐藏.

Drawer footer:

- 取消.
- 保存配置.

## Settings

Metrics:

- 开启配置.
- 关闭配置.
- 维护项.
- 危险开关.
- 最后保存.

Table fields:

- 配置名称.
- 模块.
- 当前值.
- 状态.
- 更新时间.
- 操作.

Drawer groups:

- 平台配置.
- 安全配置.
- 通知配置.
- 实时服务.
- 系统维护.
- 危险操作.

Dangerous operations:

- 关闭交易.
- 关闭注册.
- 关闭充值.
- 关闭提现.
- 维护模式.

Dangerous operations must require a second confirmation.

## Configuration Statuses

- 开启: green.
- 关闭: gray.
- 维护: orange.
- 危险: red.

