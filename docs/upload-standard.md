# KAIROX 图片上传标准

状态：**Closed / RC2 归档**
适用版本：KYC 修复 release `20260712-133723`，Build ID `G4JHQSojZ7goaCqR9U7XC`

## 统一处理流程

浏览器端图片先经过 `app/lib/compressImage.ts`：

1. 校验 MIME。
2. 原始文件超过 25 MB 时拒绝处理。
3. 使用 `createImageBitmap` 解码；HEIC/HEIF 在浏览器运行时动态加载 `heic2any` 转 JPEG。
4. 最大边长限制为 1920px。
5. 使用 Canvas 输出 JPEG，质量依次为 `0.78 → 0.62 → 0.48`。
6. 压缩后仍超过 2 MB 时返回明确错误，不提交原始大文件。

支持格式：`image/jpeg`、`image/png`、`image/webp`、`image/heic`、`image/heif`。

## 大小限制

| 层级 | 限制 | 行为 |
|---|---:|---|
| 前端单文件 | 2 MB | 发送前阻止，并提示具体文件过大 |
| KYC API 单文件 | 2 MB | 返回 HTTP 413 JSON |
| Nginx `/api/kyc` 总请求 | 5 MB | 作为 multipart 总量保护 |

前端提示：

- `Front image is too large. Please choose or retake a clearer photo.`
- `Back image is too large. Please choose or retake a clearer photo.`

## KYC API 规范

KYC 使用 `FormData` 字段：`legalName`、`documentType`、`front`、`back`。

超限响应示例：

```json
{
  "error": "Front image exceeds the 2 MB limit."
}
```

HTTP 状态为 `413`。服务端不返回 SQL、堆栈、文件路径或图片内容。

Nginx 主域名配置：

```nginx
location = /api/kyc {
    client_max_body_size 5m;
    proxy_pass http://127.0.0.1:3000;
}
```

## 异常处理规范

- `401`：`Session expired. Please sign in again.`
- `413`：显示单文件超限提示。
- `409`：`A KYC review is already pending.`
- 非 JSON、网络失败、服务端 5xx：`Unable to submit verification. Please try again.`
- 所有提交请求必须在 `finally` 恢复 submitting 状态。
- 不因文件名相同判定 Front/Back 重复；两侧使用独立本地成功令牌。

## 上传入口盘点（只读）

| 入口 | 当前实现 | 是否完全复用本标准 |
|---|---|---|
| KYC Front/Back | 复用 `compressImage`；单文件 2 MB；独立状态和 API 字段 | 是（本标准基线） |
| Crypto Deposit proof | 前端复用 `compressImage`，但 API/文案仍为 5 MB，服务端仅 JPEG/PNG/WebP | 否，尺寸策略未统一 |
| Fiat Deposit proof | 原始文件处理，5 MB；JPEG/PNG/WebP；不复用 `compressImage` | 否 |
| Support Chat attachment | 当前代码未发现与 KYC 相同的统一压缩/API 规则；需另行审计 | 未统一 |
| Avatar/Profile image | 当前代码未发现 KYC 级别的统一压缩入口 | 未统一 |
| Admin KYC preview | 读取 KYC 已保存数据，不负责上传压缩 | 不适用 |

本次只归档 KYC 标准，未修改其他入口行为。
