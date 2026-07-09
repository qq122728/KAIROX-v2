# AI Handoff Notes — VORX Protocol

最后更新: 2026-07-09

这些笔记记录实战中踩过的坑，供后续 AI Agent 参考。

## 项目速览

| 项 | 值 |
|----|-----|
| 根目录 | `/var/www/vorx/` |
| 应用代码 | `app/` (Next.js App Router, TypeScript) |
| 数据库 | SQLite `/var/lib/vorx/vorx.sqlite` |
| CSS | `app/mobile-polish.css` (~9000行), `app/admin/admin-console.css` |
| PM2 | `vorx-next`(:3020), `vorx-socket`(:3021), `vorx-settlement` |
| Node | 24.x via nvm |
| 用户 | 大哥，马来西亚华人，TG @Doge9913，中文沟通 |

## 部署工作流

```bash
cd /var/www/vorx
npx next build
pm2 restart vorx-next --update-env    # 必须 --update-env
pm2 save
```

⚠️ 忘记 `pm2 restart` 是改动不生效的 #1 原因。每次 build 后必须重启。

## 大哥的工作习惯

- "不要 commit" = 改了代码但不提交
- "提交" = git commit
- "好了吗" = 完成了？
- "OK 退下" = 结束，可以走了
- "爱马仕" = Hermes
- "vrtx" = VORX
- 需求文档用 .docx (Word)，不要 .md
- 重要操作不能藏在下拉菜单里
- 数据缺失直接查/改数据库，不要绕前端
- 代码审查三步: 只查不摸 → 出报告 → 等"开始" → 实现
- 安全校验用 curl 实测，不只看代码
- 诈骗平台: 先侦查后攻击，激进渗透

## 关键文件位置

| 文件 | 用途 |
|------|------|
| `app/admin/page.tsx` | Admin 全部逻辑 (~4100行单文件) |
| `app/components/FluxMobileApp.tsx` | 前端 SPA shell (~4100行) |
| `app/lib/admin-audio.ts` | 通知声音模块 |
| `lib/realtime.ts` | emitRealtime 桥接函数 |
| `lib/db.ts` | 数据库连接 + schema 迁移 |
| `realtime/socket-server.mjs` | Socket.IO 服务器 |
| `ecosystem.config.cjs` | PM2 配置 |
| `.env.production.local` | 生产环境变量 (不提交) |

## 常见坑

### 数据库

- SQLite 日期格式: JS `toISOString()` → `"2026-07-05T13:12:22.000Z"` ≠ SQLite `CURRENT_TIMESTAMP` → `"2026-07-05 21:12:22"`
- 修复: 用 SQLite `datetime('now','-5 minutes')` 替代 JS Date
- 双 Z 陷阱: `new Date(s.replace(" ","T")+"Z")` 对 ISO 格式会变成 `...ZZ` → NaN
- `inTransaction()` 用于余额更新 (防止竞态)
- `addColumn()` idempotent，PM2 缓存旧 schema 时需手动 `ALTER TABLE`

### 前端

- FormData fetch: 不要手动设 `Content-Type` header (boundary 缺失)
- JSX 中 inline `.find()` / IIFF 会导致 Turbopack 构建失败
- `Record<string,unknown>` 的字段在 JSX 中需 IIFE 包裹类型收窄
- `git add -A` 会误提交 `.sqlite`/`CODE_REVIEW.md` 等文件
- 法币入金 quick-actions 是 3 列 grid，不能加第 4 个按钮

### 通知系统

- 通知类型全名用冒号: `fiat_deposit:requested` (不是 `fiat_deposit`)
- `alwaysRingTypes` 决定是否响铃，`panelTypes` 决定是否显示
- `notifiedEventsRef` 去重，`SOUND_COOLDOWN=3000` 节流
- `unlockAudio()` 必须在用户手势中调用（pointerdown/keydown）
- speechSynthesis 需要 prime: `new SpeechSynthesisUtterance(""); speechSynthesis.speak(u)`
- `speakChinese()` 现在有 `[notify]` 前缀的 console 日志
- mp3 超时已从 8s 降到 2s

### 其他

- Frankfurter v2 API 返回 `{ rate: N }` 单数，不是 `{ rates: {...} }`
- VPS SMTP 端口通常被封，用 HTTP API (Resend)
- Cloudflare 邮件 DNS 必须灰云 (MX/SPF/DKIM)
- `patch` 工具 old_string 太短会重复匹配产生 bug
- Hermes gateway 不能 self-restart
- `node:sqlite:DatabaseSync` 是实验性 API

## 验证模式

推荐在 push 前:

```bash
cd /var/www/vorx
npx next build      # 必须 0 错误
pm2 status           # 确认进程运行
curl -s http://localhost:3020 -o /dev/null -w '%{http_code}'  # 200
curl -s http://localhost:3021/health                           # 200
```

## 通知系统调试

```bash
# Socket emit 测试
SECRET="从.env.production.local取"
curl -s -X POST http://localhost:3021/internal/emit \
  -H "Content-Type: application/json" \
  -H "x-realtime-secret: $SECRET" \
  -d '{"event":"admin:update","room":"admin","payload":{"type":"fiat_deposit:requested","depositId":1,"userId":1,"currency":"MYR"}}'
```

浏览器 console 检查:
```js
// 查看语音状态
speechSynthesis.getVoices().filter(v => v.lang.startsWith('zh'))
// 手动解锁 (需要在用户手势后)
// 正常路径: 点击页面 → armNotificationAudio → unlockAudio()
```
