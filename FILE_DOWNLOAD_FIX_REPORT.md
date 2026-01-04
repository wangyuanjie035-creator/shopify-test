# 文件上传/下载问题调查与修复报告

版本：2025-12-25  
维护者：工程协作助手（AI）

## 一、问题概述
- 现象：后台下载 3D 文件返回 0.9KB 或 404，无法获取实际文件。
- 主要错误：
  - staged upload：`Invalid Model 3d url=...`（资源类型/MIME 不匹配）。
  - fileCreate 查询字段错误：`contentType` 不存在导致 `undefinedField`。
  - 下载 404：后台仍请求 `/api/download-file?id=file_...` 占位链接。
  - 浏览器本地存储溢出：`uploaded_files` 过大。

## 二、根因分析
1) 上传链路
   - STEP/STP 不被 Shopify 视为 MODEL_3D，stagedUploadsCreate 必须 resource=FILE 且 MIME=application/octet-stream。
   - fileCreate 查询字段包含不支持的 `contentType`，导致报错。
   - 上传后未将 Shopify 文件 URL/ID 落到可查询的持久存储（仅返回占位 fileId）。

2) 下载链路
   - 后台页面仍用占位 fileId 拼下载链接，导致调用 `/download-file?id=file_...`。
   - download-file 接口只按列表查询 metaobject，旧/缺失记录无法命中。

3) 旧数据与缓存
   - 改造前的订单缺少 Shopify 文件 URL/ID，继续使用旧占位链接必然 404。
   - 浏览器/模板缓存可能加载旧 JS 逻辑。

## 三、修复措施（已上线）
1) `api/store-file-real.js`
   - STEP/STP 按 FILE 处理；staged upload MIME=application/octet-stream；resource=FILE。
   - fileCreate 仅查询合法字段（url、originalFileSize），去掉 contentType。
   - 写入 `uploaded_file` metaobject，handle=fileId，字段包含：file_id、file_name、file_type、file_url、shopify_file_id、file_size、upload_time。
   - 响应返回 shopifyFileUrl / shopifyFileId 供前端直接使用。

2) `api/download-file.js`
   - Shopify 文件查询改用 `node(id)`（兼容 GenericFile/MediaImage），避免 `file(id)` 不存在。
   - 优先 `metaobjectByHandle(handle=fileId, type=uploaded_file)`，未命中再列表查询。
   - 查询失败/无数据时明确返回错误，避免 undefined 异常。

3) 前端后台页 `templates/page.admin-draft-orders.liquid`
   - 下载优先级：Shopify文件URL → Shopify文件ID（调用 `/api/download-file?shopifyFileId=...`）→ Base64/占位。
   - 这样新订单若有 Shopify 文件信息，不再走占位 fileId。

4) 前端本地缓存 `assets/file-storage.js`
   - 不再将 Base64 写入 localStorage，改用内存缓存，避免配额溢出。

## 四、现状
- 最新代码已推送 `main` 并验证：新订单上传后可正常下载，文件大小与原始一致。
- DeprecationWarning `url.parse` 与功能无关，后续可统一替换为 WHATWG `URL`。

## 五、使用与验证指引
1) 确保部署最新代码，浏览器强制刷新清缓存。  
2) 新建询价（上传文件），检查响应包含 `shopifyFileUrl` / `shopifyFileId`。  
3) 后台列表下载：Network 应显示带 `shopifyFileId` 的请求或直接跳转 CDN URL，文件大小应与原始匹配。  
4) 旧订单（无 Shopify 文件信息）仍会 404，需要重新上传生成新记录；或手动补写对应的文件 URL/ID。

## 六、旧数据处理建议（可选）
- 如需让旧订单可下载，需批处理：根据历史上传结果找到对应文件 URL/ID，写回 metaobject/line item 的自定义字段（Shopify文件URL/ID），或更新 `invoice_url` 为 CDN 链接。

## 七、后续预防
- 上线前清浏览器/模板缓存，确保新 JS 生效。  
- 下载链路统一依赖 Shopify 文件 URL/ID，不再使用占位 fileId。  
- 大文件避免写 localStorage，改用内存或后端存储。  
- 逐步替换后端 `url.parse` 为 `new URL()`。  

## 相关改动记录（主分支）
- 关键提交：`af41340`、`9787358`、`089e6db` 等（上传、下载、前端下载优先级、metaobject 存储）。  


