# Vercel CORS 问题排查指南

## 问题描述

更换Vercel域名后出现CORS错误：
```
Access to fetch at 'https://shopify-v587.vercel.app/api/store-file-real' 
from origin 'https://sain-pdc-test.myshopify.com' 
has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

---

## 排查步骤

### 1. 检查Vercel部署状态

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 找到你的项目
3. 检查最新部署是否成功
4. 查看部署日志，确认没有错误

**检查点**:
- ✅ 部署状态是否为 "Ready"
- ✅ 是否有构建错误
- ✅ 环境变量是否正确加载

---

### 2. 检查环境变量

在Vercel Dashboard中检查环境变量：

1. 进入项目设置 → Environment Variables
2. 确认以下变量已设置：
   - `SHOP` 或 `SHOPIFY_STORE_DOMAIN`
   - `ADMIN_TOKEN` 或 `SHOPIFY_ACCESS_TOKEN`

**重要**: 
- 确保环境变量在**所有环境**（Production, Preview, Development）都已设置
- 检查变量名是否正确（区分大小写）

---

### 3. 测试API端点

#### 方法1: 使用curl测试OPTIONS请求

```bash
# 测试OPTIONS预检请求
curl -X OPTIONS \
  -H "Origin: https://sain-pdc-test.myshopify.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v \
  https://shopify-v587.vercel.app/api/store-file-real
```

**期望输出**:
```
< HTTP/1.1 204 No Content
< Access-Control-Allow-Origin: https://sain-pdc-test.myshopify.com
< Access-Control-Allow-Methods: GET,POST,OPTIONS,PATCH,DELETE
< Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept
< Access-Control-Allow-Credentials: true
```

如果**没有**看到 `Access-Control-Allow-Origin` 头，说明CORS配置有问题。

#### 方法2: 使用浏览器测试

在Shopify商店页面的控制台执行：

```javascript
// 测试OPTIONS请求
fetch('https://shopify-v587.vercel.app/api/store-file-real', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://sain-pdc-test.myshopify.com',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type'
  }
})
.then(res => {
  console.log('Status:', res.status);
  console.log('Headers:', [...res.headers.entries()]);
})
.catch(err => console.error('Error:', err));
```

---

### 4. 检查代码部署

确认代码已正确部署：

1. **检查GitHub连接**:
   - Vercel Dashboard → Settings → Git
   - 确认连接的仓库正确
   - 确认分支正确（通常是 `main` 或 `master`）

2. **检查文件是否存在**:
   - 确认 `api/store-file-real.js` 文件已提交到GitHub
   - 确认 `utils/cors-config.js` 文件已提交到GitHub

3. **强制重新部署**:
   - Vercel Dashboard → Deployments
   - 点击最新部署的 "..." 菜单
   - 选择 "Redeploy"

---

### 5. 检查Vercel函数日志

1. 在Vercel Dashboard中打开项目
2. 进入 "Functions" 标签
3. 查看 `api/store-file-real.js` 的日志
4. 检查是否有错误信息

**查找**:
- CORS相关的日志
- 函数执行错误
- 环境变量加载错误

---

### 6. 验证vercel.json配置

确认 `vercel.json` 文件已正确提交：

```json
{
  "functions": {
    "api/store-file-real.js": {
      "maxDuration": 30
    }
  }
}
```

**注意**: 
- `vercel.json` 必须在项目根目录
- 文件格式必须是有效的JSON
- 提交后需要重新部署

---

### 7. 检查函数响应

创建一个测试端点来验证CORS配置：

访问: `https://shopify-v587.vercel.app/api/test-cors`

如果测试端点返回正确的CORS头，但 `store-file-real` 不返回，说明问题在特定函数中。

---

## 常见问题和解决方案

### 问题1: 环境变量未加载

**症状**: API返回500错误或环境变量相关的错误

**解决**:
1. 检查Vercel Dashboard中的环境变量
2. 确认变量名正确（`SHOP` 或 `SHOPIFY_STORE_DOMAIN`）
3. 重新部署项目

---

### 问题2: 代码未更新

**症状**: 修改代码后，部署的版本仍然是旧代码

**解决**:
1. 确认代码已提交到GitHub
2. 在Vercel Dashboard中查看部署日志，确认使用了最新提交
3. 如果未自动部署，手动触发部署

---

### 问题3: OPTIONS请求未处理

**症状**: OPTIONS请求返回404或405错误

**解决**:
确认所有API文件都正确处理OPTIONS请求：

```javascript
export default async function handler(req, res) {
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // ... 其他代码
}
```

---

### 问题4: CORS头未设置

**症状**: OPTIONS请求返回200，但没有CORS头

**解决**:
1. 确认 `setCorsHeaders` 函数在OPTIONS检查**之前**调用
2. 确认函数正确执行（添加日志）

```javascript
export default async function handler(req, res) {
  // 必须在OPTIONS检查之前调用
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
}
```

---

### 问题5: Vercel缓存问题

**症状**: 修改代码后，行为没有改变

**解决**:
1. 清除浏览器缓存
2. 在Vercel Dashboard中强制重新部署
3. 等待几分钟让CDN缓存过期

---

## 快速修复检查清单

- [ ] 确认代码已提交到GitHub
- [ ] 确认Vercel已连接到正确的GitHub仓库
- [ ] 确认最新部署成功
- [ ] 确认环境变量已设置（所有环境）
- [ ] 确认 `vercel.json` 已提交
- [ ] 测试OPTIONS请求是否返回CORS头
- [ ] 检查函数日志是否有错误
- [ ] 强制重新部署一次

---

## 测试命令

### 完整测试脚本

```bash
#!/bin/bash

API_URL="https://shopify-v587.vercel.app/api"
ORIGIN="https://sain-pdc-test.myshopify.com"

echo "测试 OPTIONS 请求..."
curl -X OPTIONS \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v \
  "$API_URL/store-file-real" 2>&1 | grep -i "access-control"

echo ""
echo "测试 GET 请求..."
curl -X GET \
  -H "Origin: $ORIGIN" \
  -v \
  "$API_URL/test-cors" 2>&1 | grep -i "access-control"
```

---

## 如果问题仍然存在

1. **检查Vercel状态**: [status.vercel.com](https://status.vercel.com)
2. **查看Vercel文档**: [vercel.com/docs](https://vercel.com/docs)
3. **联系Vercel支持**: 在Vercel Dashboard中提交支持请求

---

## 临时解决方案

如果CORS问题无法立即解决，可以临时使用代理：

在Shopify主题中添加代理页面，通过服务器端请求绕过CORS限制。

---

**最后更新**: 2025-01-29
