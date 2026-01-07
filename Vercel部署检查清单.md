# Vercel 部署检查清单

## 🔍 快速诊断步骤

### 步骤1: 验证API是否可访问

在浏览器中直接访问（不受CORS限制）：
```
https://shopify-v587.vercel.app/test-cors
```

**期望结果**: 返回JSON，包含CORS配置信息

**如果返回404**: 
- ❌ API文件未部署
- ✅ 检查GitHub仓库中是否有 `api/test-cors.js` 文件

**如果返回500**: 
- ❌ 代码执行错误
- ✅ 查看Vercel函数日志

---

### 步骤2: 检查OPTIONS请求

在终端执行：

```bash
curl -X OPTIONS \
  -H "Origin: https://sain-pdc-test.myshopify.com" \
  -H "Access-Control-Request-Method: POST" \
  -v \
  https://shopify-v587.vercel.app/store-file-real 2>&1 | grep -i "access-control"
```

**期望输出**:
```
< access-control-allow-origin: https://sain-pdc-test.myshopify.com
< access-control-allow-methods: GET,POST,OPTIONS,PATCH,DELETE
< access-control-allow-headers: Content-Type, Authorization, X-Requested-With, Accept
```

**如果没有输出**: CORS头未设置 ❌

---

### 步骤3: 检查Vercel部署

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 找到项目 `shopify-test-Issac-branch`（或你的项目名）
3. 检查：
   - ✅ 最新部署状态是否为 "Ready"
   - ✅ 部署时间是否为最近
   - ✅ 是否有错误或警告

---

### 步骤4: 检查环境变量

在Vercel Dashboard中：

1. 项目设置 → Environment Variables
2. 确认以下变量存在：
   - `SHOP` 或 `SHOPIFY_STORE_DOMAIN`
   - `ADMIN_TOKEN` 或 `SHOPIFY_ACCESS_TOKEN`
3. **重要**: 检查变量是否在以下环境都设置了：
   - ✅ Production
   - ✅ Preview  
   - ✅ Development

---

### 步骤5: 检查GitHub连接

1. Vercel Dashboard → Settings → Git
2. 确认：
   - ✅ 连接的仓库正确
   - ✅ 分支正确（通常是 `main`）
   - ✅ 自动部署已启用

---

### 步骤6: 强制重新部署

如果修改了代码或配置：

1. Vercel Dashboard → Deployments
2. 找到最新部署
3. 点击 "..." → "Redeploy"
4. 等待部署完成

---

## 🐛 常见问题

### Q1: 代码修改后没有生效

**可能原因**:
- 代码未提交到GitHub
- Vercel未自动部署
- 浏览器缓存

**解决方法**:
1. 确认代码已 `git commit` 和 `git push`
2. 在Vercel Dashboard中查看是否有新部署
3. 如果没有，手动触发部署
4. 清除浏览器缓存（Ctrl+Shift+R）

---

### Q2: 环境变量未生效

**可能原因**:
- 变量名拼写错误
- 变量未在所有环境设置
- 需要重新部署

**解决方法**:
1. 检查变量名（区分大小写）
2. 确保在 Production/Preview/Development 都设置了
3. 重新部署项目

---

### Q3: OPTIONS请求返回404

**可能原因**:
- API文件路径错误
- 函数未正确导出

**解决方法**:
1. 确认文件路径: `api/store-file-real.js`
2. 确认文件导出了 `default` handler:
   ```javascript
   export default async function handler(req, res) {
     // ...
   }
   ```

---

### Q4: CORS头存在但请求仍被阻止

**可能原因**:
- `Access-Control-Allow-Origin` 值不匹配
- 缺少必要的CORS头
- 预检请求失败

**解决方法**:
1. 确认 `Access-Control-Allow-Origin` 的值完全匹配前端域名
2. 确认所有必要的CORS头都已设置
3. 检查OPTIONS请求是否正确处理

---

## 🔧 快速修复

### 如果CORS仍然不工作，尝试以下步骤：

1. **确认代码已更新**:
   ```bash
   git status
   git add .
   git commit -m "Fix CORS configuration"
   git push
   ```

2. **在Vercel中重新部署**:
   - Dashboard → Deployments → Redeploy

3. **等待2-3分钟**让部署完成

4. **清除浏览器缓存**:
   - Chrome: Ctrl+Shift+Delete
   - 或使用无痕模式测试

5. **测试API**:
   ```bash
   curl -X OPTIONS \
     -H "Origin: https://sain-pdc-test.myshopify.com" \
     -v \
     https://shopify-v587.vercel.app/store-file-real
   ```

---

## 📝 检查清单

在联系支持或进一步排查前，确认：

- [ ] 代码已提交到GitHub
- [ ] Vercel已连接到正确的GitHub仓库
- [ ] 最新部署成功（状态为Ready）
- [ ] 环境变量已设置（所有环境）
- [ ] `vercel.json` 文件已提交
- [ ] API文件路径正确（`api/store-file-real.js`）
- [ ] 函数正确导出了handler
- [ ] OPTIONS请求返回204状态码
- [ ] OPTIONS响应包含CORS头
- [ ] 浏览器控制台没有其他错误

---

## 🆘 如果问题仍然存在

1. **查看Vercel函数日志**:
   - Dashboard → Functions → `api/store-file-real.js` → Logs
   - 查找错误信息

2. **测试其他API端点**:
   - `https://shopify-v587.vercel.app/test-cors`
   - 如果这个可以工作，说明问题在特定函数

3. **检查Vercel状态**:
   - [status.vercel.com](https://status.vercel.com)

4. **联系支持**:
   - 在Vercel Dashboard中提交支持请求
   - 附上错误日志和测试结果

---

**最后更新**: 2025-01-29
