# 如何在Vercel查看部署的文件

## 📍 查看部署文件的几种方法

### 方法1: Vercel Dashboard（推荐）

1. **登录Vercel Dashboard**
   - 访问: https://vercel.com/dashboard
   - 使用你的GitHub账号登录

2. **选择项目**
   - 在项目列表中找到你的项目（如 `shopify-test-Issac-branch`）
   - 点击项目名称进入详情页

3. **查看部署详情**
   - 点击 "Deployments" 标签
   - 选择最新的部署
   - 点击部署卡片进入详情页

4. **查看文件**
   - 在部署详情页，你可以看到：
     - **Source**: 源代码位置（GitHub仓库和分支）
     - **Build Logs**: 构建日志
     - **Functions**: 部署的函数列表

5. **查看Functions（API文件）**
   - 在项目页面，点击 "Functions" 标签
   - 这里会列出所有部署的API函数：
     - `api/store-file-real.js`
     - `api/submit-quote-real.js`
     - `api/update-quote.js`
     - 等等...

---

### 方法2: 使用测试工具

我已经创建了一个测试工具，可以列出所有API文件：

1. **访问测试页面**（部署后）:
   ```
   https://shopify-v587.vercel.app-test.html
   ```

2. **或者使用API端点**:
   ```
   https://shopify-v587.vercel.app/list-files
   ```

这会返回所有部署的API文件列表。

---

### 方法3: 通过GitHub查看

1. **访问GitHub仓库**
   - 找到你的GitHub仓库
   - 查看 `api/` 目录下的文件

2. **确认文件已提交**
   - 检查文件是否在 `main` 或 `master` 分支
   - 确认文件已 `git commit` 和 `git push`

---

### 方法4: 使用Vercel CLI

如果你安装了Vercel CLI：

```bash
# 安装Vercel CLI
npm i -g vercel

# 登录
vercel login

# 查看项目信息
vercel ls

# 查看特定项目的部署
vercel inspect <project-name>
```

---

## 🔍 检查部署状态

### 在Vercel Dashboard中：

1. **项目概览页**
   - 查看 "Latest Deployments" 部分
   - 确认最新部署状态为 "Ready"（绿色）

2. **部署详情页**
   - 查看 "Build Logs"
   - 确认没有错误
   - 查看 "Functions" 部分，确认所有API函数都已部署

3. **Functions标签**
   - 点击项目 → Functions
   - 这里会显示所有部署的Serverless Functions
   - 每个函数显示：
     - 文件路径
     - 调用次数
     - 平均执行时间
     - 错误率

---

## 🧪 测试API是否部署

### 测试1: 直接访问（GET请求）

在浏览器中访问：
```
https://shopify-v587.vercel.app/test-cors
```

**期望结果**: 返回JSON数据
```json
{
  "success": true,
  "message": "CORS配置正常！",
  ...
}
```

**如果返回404**: 
- ❌ API文件未部署
- ✅ 检查GitHub仓库中是否有该文件

**如果返回500**: 
- ❌ 代码执行错误
- ✅ 查看Vercel函数日志

---

### 测试2: 使用curl（终端）

```bash
# 测试GET请求
curl https://shopify-v587.vercel.app/test-cors

# 测试OPTIONS请求（CORS预检）
curl -X OPTIONS \
  -H "Origin: https://sain-pdc-test.myshopify.com" \
  -v \
  https://shopify-v587.vercel.app/store-file-real
```

---

### 测试3: 使用测试工具页面

1. 访问: `https://shopify-v587.vercel.app-test.html`
2. 点击 "获取文件列表" 按钮
3. 查看返回的文件列表

---

## 📋 常见问题

### Q1: 为什么浏览器直接访问API返回404？

**A**: 这是正常的！Vercel的API路由需要：
- 正确的HTTP方法（GET/POST/OPTIONS）
- 正确的请求头
- 某些API只接受POST请求，浏览器直接访问会失败

**解决方法**: 使用测试工具或curl命令测试

---

### Q2: 如何确认文件已部署？

**A**: 
1. 在Vercel Dashboard → Functions 中查看
2. 使用 `https://shopify-v587.vercel.app/list-files` 获取列表
3. 测试API端点是否响应

---

### Q3: 文件在GitHub但Vercel没有部署？

**A**: 
1. 检查Vercel是否连接到正确的GitHub仓库
2. 检查分支是否正确（通常是 `main`）
3. 检查自动部署是否启用
4. 手动触发部署：Dashboard → Deployments → "..." → Redeploy

---

### Q4: 如何查看函数执行日志？

**A**:
1. Vercel Dashboard → 项目 → Functions
2. 点击函数名称（如 `api/store-file-real.js`）
3. 查看 "Logs" 标签
4. 这里会显示所有函数调用和错误信息

---

## 🎯 快速检查清单

- [ ] 登录Vercel Dashboard
- [ ] 找到项目
- [ ] 查看最新部署状态（应该是 "Ready"）
- [ ] 查看 Functions 标签，确认API文件列表
- [ ] 测试 `https://shopify-v587.vercel.app/test-cors`
- [ ] 使用测试工具查看文件列表
- [ ] 检查环境变量是否设置

---

## 📝 下一步

如果确认文件已部署但CORS仍有问题：

1. 查看函数日志，查找错误信息
2. 测试 `test-cors` 端点，确认CORS配置
3. 检查环境变量是否正确设置
4. 参考 `Vercel_CORS排查指南.md` 进行详细排查

---

**最后更新**: 2025-01-29
