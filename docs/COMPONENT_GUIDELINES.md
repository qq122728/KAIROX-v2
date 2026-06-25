# Component Guidelines

Use these component rules for all VORX admin pages.

## Metric Cards

Purpose: summarize the current operational state.

Rules:

- Number first.
- Label second.
- Helper text third.
- Keep height compact.
- No charts inside list-page metric cards.
- Use green/orange/red/blue only when the metric status requires it.

## Filter Toolbar

Purpose: reduce a list quickly without form-heavy UI.

Structure:

- Search pill.
- Filter chips.
- `重置`.
- `搜索`.

Rules:

- Prefer filter chips over select dropdowns.
- Use short Chinese labels.
- Keep toolbar visually lighter than the table.
- Do not introduce large form grids in list pages.

## Tables

Purpose: primary operation surface.

Rules:

- Tables should be dense but breathable.
- Row height should be around 74px.
- Use separated rows.
- Hover and selected states are mandatory.
- Amount columns are right aligned.
- Status columns are centered.
- Email and UID stay left aligned.
- Actions are always minimal.

## Status Chips

Use status chips for all visible states.

Standard labels:

- 开启
- 关闭
- 正常
- 待审核
- 处理中
- 运行中
- 待结算
- 已通过
- 已拒绝
- 已盈利
- 已亏损
- 已取消
- 冻结
- 禁用
- 维护

## Row Actions

Every list row should expose:

- `查看`
- `更多`

The `更多` menu can include:

- 查看详情
- 资金
- 安全
- 交易记录
- 登录记录
- 权限
- 备注
- 历史记录
- 查看日志

Dangerous operations are never first-level table actions.

## Drawer

Purpose: detail review, editing, and high-risk actions.

Rules:

- Hidden by default.
- Opens from the right.
- Width: 420px to 460px, default 440px.
- Contains grouped blocks.
- Footer contains primary actions where appropriate.
- Dangerous actions are grouped and visually separated.

Common groups:

- 基本信息
- 资金信息
- 审核资料
- 订单信息
- 持仓详情
- 配置参数
- 状态
- 流水
- 风险信息
- 危险操作

## Configuration Drawer

Configuration pages use explicit save.

States:

- `● 未保存修改`
- `✓ 已保存`

Rules:

- Editing fields in Drawer does not immediately save.
- Save button is fixed in Drawer footer.
- Dangerous settings require second confirmation.

## Dangerous Operations

Dangerous operations include:

- 上下分
- 修改登录密码
- 修改提现密码
- 人工结算
- 强平
- 关闭交易
- 关闭注册
- 关闭充值
- 关闭提现
- 维护模式

Rules:

- Must appear in Drawer.
- Must show impact summary.
- Must include operator note or confirmation copy.
- Must be visually separated using danger styling.

## Icons

- Use Lucide only.
- Do not mix icon systems.
- Icons should support recognition but never replace text labels for critical actions.

## Empty States

Empty states should explain the operational meaning.

Good examples:

- `暂无待审核充值`
- `当前没有高风险持仓`
- `没有匹配的用户`

Avoid generic empty copy like `No data`.

