# 🌐 CORS 设置快速参考

## 📍 CORS 设置位置总览

CORS（跨域资源共享）设置在**所有后端 API 文件**的开头部分。

---

## 📂 文件位置列表

### 1. api/quotes-restored.js
**位置**: 第 15-31 行  
**类型**: 动态 CORS（支持多个域名）

```javascript
// 第 15-31 行
const allowedOrigins = [
  'https://sain-pdc-test.myshopify.com',
  'https://rt08kw-se.myshopify.com',
  'http://localhost:3000'
];

const origin = req.headers.origin;
if (allowedOrigins.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
} else {
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
}

res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Origin');
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

**特点**:
- ✅ 支持多个域名
- ✅ 动态判断请求来源
- ✅ 支持凭证（cookies）

---

### 2. api/upload-file.js
**位置**: 第 103-105 行  
**类型**: 固定单域名 CORS

```javascript
// 第 103-105 行
res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

**特点**:
- ✅ 只允许特定域名
- ✅ 只允许 POST 和 OPTIONS 方法
- ✅ 更安全（限制更严格）

---

### 3. api/send-email.js
**位置**: 第 55-57 行  
**类型**: 开放 CORS（允许所有域名）

```javascript
// 第 55-57 行
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

**特点**:
- ✅ 允许所有域名（`*`）
- ⚠️ 安全性较低
- 💡 适合公开 API

---

### 4. api/download-file.js
**位置**: 预计在文件开头（需要检查）

### 5. api/cleanup-files.js
**位置**: 预计在文件开头（需要检查）

---

## 🔍 如何查找 CORS 设置

### 方法 1: 在文件中搜索

在任何 API 文件中搜索：
```
Access-Control-Allow-Origin
```

### 方法 2: 查看函数开头

CORS 设置通常在 `handler` 函数的最开头：

```javascript
export default async function handler(req, res) {
  // CORS 设置通常在这里 ← 
  res.setHeader('Access-Control-Allow-Origin', '...');
  res.setHeader('Access-Control-Allow-Methods', '...');
  res.setHeader('Access-Control-Allow-Headers', '...');
  
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // 其他业务逻辑...
}
```

---

## 🛠️ 如何修改 CORS 设置

### 场景 1: 添加新的允许域名

**文件**: `api/quotes-restored.js`  
**位置**: 第 16-20 行

```javascript
// 修改前
const allowedOrigins = [
  'https://sain-pdc-test.myshopify.com',
  'https://rt08kw-se.myshopify.com',
  'http://localhost:3000'
];

// 修改后（添加新域名）
const allowedOrigins = [
  'https://sain-pdc-test.myshopify.com',
  'https://rt08kw-se.myshopify.com',
  'https://your-new-store.myshopify.com',  // ← 新增
  'http://localhost:3000'
];
```

---

### 场景 2: 修改允许的 HTTP 方法

**文件**: `api/quotes-restored.js`  
**位置**: 第 29 行

```javascript
// 修改前
res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');

// 修改后（添加 PUT 方法）
res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
```

---

### 场景 3: 添加允许的请求头

**文件**: `api/quotes-restored.js`  
**位置**: 第 30 行

```javascript
// 修改前
res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Origin');

// 修改后（添加 Authorization 头）
res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Origin,Authorization');
```

---

## ⚠️ 常见问题

### Q1: 为什么每个 API 文件都要设置 CORS？

**A**: 因为每个 API 文件是独立的 Serverless Function，需要各自设置。

### Q2: 可以只设置一次吗？

**A**: 在 Vercel 中不行，每个函数都是独立的。但可以创建一个共享函数：

```javascript
// 创建 api/_cors.js
export function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 在其他文件中使用
import { setCORS } from './_cors.js';

export default async function handler(req, res) {
  setCORS(res);
  // ...
}
```

### Q3: `*` 和具体域名有什么区别？

**A**: 

| 设置 | 安全性 | 适用场景 |
|------|--------|---------|
| `*`（所有域名） | ⚠️ 低 | 公开 API |
| 具体域名 | ✅ 高 | 私有 API |
| 多个域名列表 | ✅ 高 | 多环境（开发/测试/生产） |

### Q4: OPTIONS 请求是什么？

**A**: 

浏览器的**预检请求**（Preflight Request）：

```
1. 浏览器准备发送 POST 请求
   ↓
2. 浏览器先发送 OPTIONS 请求询问："我可以发送 POST 吗？"
   ↓
3. 服务器回复："可以，允许 POST"
   ↓
4. 浏览器发送真正的 POST 请求
```

**处理方式**:
```javascript
if (req.method === 'OPTIONS') {
  return res.status(204).end(); // 返回 204 表示"允许"
}
```

### Q5: 如何测试 CORS 是否生效？

**方法 1: 浏览器控制台**

```javascript
// 在 Shopify 商店页面的控制台执行
fetch('https://shopify-13s4.vercel.app/api/quotes')
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
```

如果看到错误：
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```
说明 CORS 设置有问题。

**方法 2: 使用 curl（不受 CORS 限制）**

```bash
curl https://shopify-13s4.vercel.app/api/quotes
```

curl 请求不会被 CORS 阻止，可以用来测试 API 本身是否正常。

---

## 📚 相关文档

- [MDN - CORS 详解](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS)
- [Vercel - CORS 配置](https://vercel.com/guides/how-to-enable-cors)
- [本项目 - SYSTEM_WORKFLOW.md](./3.SYSTEM_WORKFLOW.md#3-cors-跨域资源共享)

---

## 🎯 快速定位表

| 文件 | 行号 | CORS 类型 | 允许的域名 |
|------|------|-----------|-----------|
| api/quotes-restored.js | 15-31 | 动态多域名 | 3个域名 + 动态判断 |
| api/upload-file.js | 103-105 | 固定单域名 | sain-pdc-test.myshopify.com |
| api/send-email.js | 55-57 | 开放所有域名 | * (所有域名) |
| api/download-file.js | 待确认 | 待确认 | 待确认 |
| api/cleanup-files.js | 待确认 | 待确认 | 待确认 |

---

**文档版本**: 1.0  
**最后更新**: 2025-01-29  
**维护者**: AI Assistant

