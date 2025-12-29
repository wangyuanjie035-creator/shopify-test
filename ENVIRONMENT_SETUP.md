# 🔧 环境变量配置指南

## 📋 目录
1. [为什么需要环境变量](#为什么需要环境变量)
2. [本地开发配置](#本地开发配置)
3. [生产环境配置](#生产环境配置)
4. [获取 Shopify API 令牌](#获取-shopify-api-令牌)
5. [常见问题](#常见问题)

---

## 为什么需要环境变量

环境变量用于存储敏感信息和配置，例如：
- **Shopify 商店域名**：你的商店地址
- **API 访问令牌**：用于访问 Shopify Admin API 的密钥

**为什么不能直接写在代码里？**
- 🔒 **安全性**：避免敏感信息泄露
- 🔄 **灵活性**：不同环境使用不同配置
- 👥 **团队协作**：每个人使用自己的配置

---

## 本地开发配置

### 步骤 1: 创建 .env 文件

```bash
# 在项目根目录执行
cp env.example .env
```

### 步骤 2: 编辑 .env 文件

使用文本编辑器打开 `.env` 文件，填写实际值：

```bash
# Shopify 商店域名（不包含 https://）
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com

# Shopify Admin API 访问令牌
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**示例**（使用占位符）:
```bash
SHOPIFY_STORE_DOMAIN=<your-store>.myshopify.com
SHOPIFY_ACCESS_TOKEN=<YOUR_SHOPIFY_ACCESS_TOKEN>
```

### 步骤 3: 验证配置

启动本地开发服务器：

```bash
# 安装 Vercel CLI（如果还没安装）
npm install -g vercel

# 启动开发服务器
vercel dev
```

测试 API：

```bash
# 测试获取报价列表
curl http://localhost:3000/api/quotes
```

如果返回 JSON 数据（而不是错误），说明配置成功！

---

## 生产环境配置

### ⚠️ 重要提示

**生产环境不使用 .env 文件！**

环境变量需要在 **Vercel 后台** 配置。

### 配置步骤

#### 1. 登录 Vercel

访问 [Vercel Dashboard](https://vercel.com/dashboard)

#### 2. 选择项目

找到你的项目（例如：`shopify-13s4`）

#### 3. 进入设置

点击项目名称 → **Settings** 标签

#### 4. 配置环境变量

点击左侧菜单 → **Environment Variables**

#### 5. 添加变量

点击 **Add New** 按钮，添加以下变量：

**变量 1: SHOPIFY_STORE_DOMAIN**
```
Key: SHOPIFY_STORE_DOMAIN
Value: your-store.myshopify.com
Environments: ✅ Production ✅ Preview ✅ Development
```

**变量 2: SHOPIFY_ACCESS_TOKEN**
```
Key: SHOPIFY_ACCESS_TOKEN
Value: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Environments: ✅ Production ✅ Preview ✅ Development
```

#### 6. 保存并重新部署

点击 **Save** 后，需要重新部署项目以使变量生效：

```bash
# 方法 1: 通过 Git 提交触发自动部署
git commit --allow-empty -m "Trigger redeploy"
git push

# 方法 2: 在 Vercel 后台手动重新部署
# Deployments → 最新部署 → ... → Redeploy
```

---

## 获取 Shopify API 令牌

### 完整步骤（带截图说明）

#### 步骤 1: 登录 Shopify 后台

访问你的商店后台：`https://your-store.myshopify.com/admin`

#### 步骤 2: 进入应用设置

```
设置 (Settings) 
  → 应用和销售渠道 (Apps and sales channels)
  → 开发应用 (Develop apps)
```

#### 步骤 3: 创建应用

如果还没有应用，点击 **创建应用** (Create an app)

填写应用信息：
- **应用名称**：例如 "3D Model Quote System"
- **应用开发者**：选择管理员

#### 步骤 4: 配置 Admin API 访问范围

点击应用 → **配置 Admin API 范围** (Configure Admin API scopes)

勾选以下权限：
- ✅ `read_files` - 读取文件
- ✅ `write_files` - 写入文件
- ✅ `read_products` - 读取产品
- ✅ `write_products` - 写入产品
- ✅ `read_customers` - 读取客户（可选）

点击 **保存** (Save)

#### 步骤 5: 安装应用

点击 **安装应用** (Install app)

确认权限授予

#### 步骤 6: 获取访问令牌

安装后，会显示 **Admin API 访问令牌** (Admin API access token)

```
格式: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**⚠️ 重要**：
- 令牌只显示一次，立即复制保存
- 不要分享给他人
- 如果丢失，需要重新生成

#### 步骤 7: 复制商店域名

商店域名格式：`your-store.myshopify.com`

**注意**：
- 不包含 `https://`
- 不包含路径（如 `/admin`）

---

## 常见问题

### Q1: .env 文件放在哪里？

**A**: 放在项目根目录（与 `package.json` 同级）

```
项目根目录/
├── .env                    ← 这里
├── env.example
├── package.json
├── api/
├── assets/
└── ...
```

### Q2: .env 文件要提交到 Git 吗？

**A**: **绝对不要！**

`.env` 文件包含敏感信息，不应该提交到代码仓库。

`.gitignore` 文件已经配置忽略 `.env` 文件。

### Q3: 如何知道环境变量是否生效？

**A**: 有两种方法：

**方法 1: 查看 Vercel 日志**

访问 Vercel 后台 → 你的项目 → Logs

如果看到类似错误，说明环境变量未配置：
```
Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN
```

**方法 2: 测试 API**

```bash
# 测试本地环境
curl http://localhost:3000/api/quotes

# 测试生产环境
curl https://shopify-13s4.vercel.app/api/quotes
```

如果返回错误信息包含 "Missing" 或 "Access denied"，说明配置有问题。

### Q4: 本地开发和生产环境可以使用不同的配置吗？

**A**: 可以！而且应该这样做。

- **本地开发**：使用 `.env` 文件，可以使用测试商店
- **生产环境**：在 Vercel 后台配置，使用正式商店

### Q5: 忘记了访问令牌怎么办？

**A**: 访问令牌只显示一次，如果忘记了需要重新生成：

1. 进入 Shopify 后台 → 设置 → 应用和销售渠道
2. 选择你的应用
3. 点击 **重新生成访问令牌** (Regenerate access token)
4. 确认后，复制新令牌
5. 更新环境变量配置

**注意**：旧令牌会立即失效，需要同时更新所有使用该令牌的地方。

### Q6: 为什么提示 "Access denied" 错误？

**A**: 可能的原因：

1. **令牌无效**：检查是否正确复制了完整的令牌
2. **权限不足**：检查应用的 Admin API 范围是否包含所需权限
3. **应用未安装**：确保应用已经安装到商店

解决方法：
1. 检查 `.env` 文件或 Vercel 环境变量中的令牌
2. 重新配置应用权限
3. 重新安装应用

### Q7: 可以在代码里打印环境变量吗？

**A**: 可以，但要小心！

```javascript
// ✅ 可以：打印变量是否存在
console.log('SHOPIFY_STORE_DOMAIN exists:', !!process.env.SHOPIFY_STORE_DOMAIN);

// ✅ 可以：打印变量长度
console.log('Token length:', process.env.SHOPIFY_ACCESS_TOKEN?.length);

// ⚠️ 谨慎：打印部分值（用于调试）
console.log('Store domain:', process.env.SHOPIFY_STORE_DOMAIN);

// ❌ 不要：打印完整的访问令牌
// console.log('Token:', process.env.SHOPIFY_ACCESS_TOKEN); // 危险！
```

### Q8: 团队协作时如何共享配置？

**A**: 

1. **不要共享 .env 文件**（包含敏感信息）
2. **共享 env.example 文件**（只包含示例）
3. **文档说明**：在 README 或文档中说明如何获取配置

团队成员应该：
1. 复制 `env.example` 为 `.env`
2. 自己获取访问令牌
3. 填写自己的配置

---

## 🔐 安全最佳实践

1. **永远不要**将 `.env` 文件提交到 Git
2. **永远不要**在公开的地方分享访问令牌
3. **定期轮换**访问令牌（建议每 3-6 个月）
4. **最小权限原则**：只授予必需的 API 权限
5. **分离环境**：开发/测试/生产使用不同的令牌
6. **监控使用**：定期检查 API 调用日志

---

## 📚 相关文档

- [Shopify Admin API 文档](https://shopify.dev/docs/api/admin)
- [Vercel 环境变量文档](https://vercel.com/docs/projects/environment-variables)
- [本项目的部署指南](./DEPLOYMENT_GUIDE.md)

---

**文档版本**: 1.0  
**最后更新**: 2025-01-29  
**维护者**: AI Assistant

