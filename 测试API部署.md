# 测试API部署 - 快速指南

## 🔍 问题诊断

根据你的错误信息：
1. **404错误**: `api/list-files` 未找到 → 文件可能未部署
2. **CORS错误**: origin为`null` → 你是直接打开HTML文件（file://协议）

---

## ✅ 解决方案

### 方案1: 使用curl测试（推荐，不受CORS限制）

在终端执行：

```bash
# 测试list-files API
curl https://shopify-v587.vercel.app/list-files

# 测试test-cors API
curl https://shopify-v587.vercel.app/test-cors

# 测试store-file-real的OPTIONS请求
curl -X OPTIONS \
  -H "Origin: https://sain-pdc-test.myshopify.com" \
  -v \
  https://shopify-v587.vercel.app/store-file-real
```

**如果返回404**: 说明文件未部署，需要提交代码

**如果返回JSON**: 说明文件已部署 ✅

---

### 方案2: 在Vercel Dashboard查看

1. 登录 https://vercel.com/dashboard
2. 找到项目
3. 点击 **"Functions"** 标签
4. 查看是否有 `api/list-files.js` 和 `api/test-cors.js`

**如果没有**: 说明文件未部署

---

### 方案3: 检查GitHub仓库

1. 访问你的GitHub仓库
2. 检查 `api/` 目录下是否有：
   - `list-files.js` ✅
   - `test-cors.js` ✅

**如果没有**: 需要提交文件

---

## 🚀 部署步骤

### 1. 确认文件已创建

检查本地文件：
```bash
# Windows PowerShell
dir api\list-files.js
dir api\test-cors.js
```

### 2. 提交到Git

```bash
git status
git add api/list-files.js
git add api/test-cors.js
git commit -m "Add API test endpoints"
git push
```

### 3. 等待Vercel部署

- 自动部署：等待2-3分钟
- 手动部署：Vercel Dashboard → Deployments → Redeploy

### 4. 验证部署

```bash
# 等待部署完成后测试
curl https://shopify-v587.vercel.app/list-files
```

---

## 🧪 测试方法（不依赖CORS）

### 方法1: 使用curl（推荐）

```bash
# 测试所有API端点
curl https://shopify-v587.vercel.app/test-cors
curl https://shopify-v587.vercel.app/list-files
curl https://shopify-v587.vercel.app/store-file-real
```

### 方法2: 使用浏览器直接访问（GET请求）

在浏览器地址栏输入：
```
https://shopify-v587.vercel.app/test-cors
https://shopify-v587.vercel.app/list-files
```

**注意**: 只能测试GET请求，POST请求会失败

### 方法3: 使用Postman或类似工具

- 不受CORS限制
- 可以测试所有HTTP方法

---

## 📋 检查清单

- [ ] `api/list-files.js` 文件已创建
- [ ] `api/test-cors.js` 文件已更新（允许所有origin）
- [ ] 文件已提交到Git (`git add`, `git commit`, `git push`)
- [ ] Vercel已自动部署（或手动触发部署）
- [ ] 使用curl测试API返回200（不是404）

---

## 🐛 如果仍然404

### 可能原因：

1. **文件未提交到Git**
   ```bash
   git status  # 检查文件是否在未提交列表中
   ```

2. **Vercel未连接到正确的GitHub仓库**
   - 检查Vercel Dashboard → Settings → Git
   - 确认仓库和分支正确

3. **部署失败**
   - 查看Vercel Dashboard → Deployments → 最新部署的日志
   - 查找错误信息

4. **文件路径错误**
   - Vercel的API路由：`api/文件名.js` → `/api/文件名`
   - 确认文件在 `api/` 目录下，不在子目录

---

## 🎯 快速测试命令

复制粘贴到终端执行：

```bash
echo "测试API部署状态..."
echo ""
echo "1. 测试 test-cors:"
curl -s https://shopify-v587.vercel.app/test-cors | head -5
echo ""
echo "2. 测试 list-files:"
curl -s https://shopify-v587.vercel.app/list-files | head -5
echo ""
echo "3. 测试 store-file-real (OPTIONS):"
curl -s -X OPTIONS -H "Origin: https://sain-pdc-test.myshopify.com" \
  https://shopify-v587.vercel.app/store-file-real -I | grep -i "access-control"
```

---

## 📝 下一步

1. **先提交代码**:
   ```bash
   git add api/list-files.js api/test-cors.js
   git commit -m "Add test endpoints"
   git push
   ```

2. **等待部署完成**（2-3分钟）

3. **使用curl测试**（不受CORS限制）

4. **告诉我测试结果**，我会继续帮你排查

---

**提示**: 如果curl也返回404，说明文件确实未部署，需要检查Git提交和Vercel连接。
