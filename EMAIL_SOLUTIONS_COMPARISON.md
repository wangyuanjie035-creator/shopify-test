# 📧 邮件发送方案对比 - Shopify vs Vercel

## 问题背景

**用户疑问**：
1. Vercel 不支持发送邮件，那 Shopify 服务器支持吗？
2. 是不是因为没有 Shopify 服务器的权限？

---

## 🎯 简短答案

| 平台 | 是否支持发送邮件 | 当前权限是否支持 | 为什么不使用 |
|------|---------------|----------------|-------------|
| **Shopify** | ✅ 完全支持 | ⚠️ 需要额外权限和配置 | 配置复杂，权限受限 |
| **Vercel** | ❌ 不直接支持 SMTP | N/A | 需要第三方服务 |
| **当前方案** | ✅ `mailto:` 协议 | ✅ 无需权限 | ✅ 简单可靠 |

---

## 📊 详细对比

### 1️⃣ Shopify 邮件发送能力

#### ✅ Shopify **完全支持**发送邮件

Shopify 有强大的邮件系统：

| 邮件类型 | 是否支持 | 说明 |
|---------|---------|------|
| 订单确认邮件 | ✅ 自动 | 客户下单后自动发送 |
| 发货通知邮件 | ✅ 自动 | 订单发货后自动发送 |
| 弃单邮件 | ✅ 自动 | 客户未完成结账时发送 |
| 营销邮件 | ✅ 手动/自动 | 通过 Shopify Email 应用 |
| 自定义邮件 | ⚠️ 有限 | 需要特殊权限和配置 |

---

#### 🔐 发送自定义邮件需要的权限

**方案 A: 使用 Shopify Flow**
- **权限要求**: Shopify Plus 计划（$2000+/月）
- **功能**: 自动化工作流，可以发送自定义邮件
- **限制**: 
  - ❌ 只对 Shopify Plus 用户开放
  - ❌ 价格昂贵
  - ❌ 配置复杂

**方案 B: 使用 Shopify Scripts API**
- **权限要求**: Shopify Plus 计划
- **限制**: 同上

**方案 C: 通过 Admin API 创建草稿订单并触发邮件**
- **API**: `DraftOrder` 突变
- **权限要求**: `write_draft_orders`
- **问题**:
  - ⚠️ 只能发送订单相关邮件
  - ⚠️ 不能发送纯报价邮件
  - ⚠️ 会创建额外的订单记录

**方案 D: 使用 Shopify Notification API**
- **状态**: ❌ **不存在**
- **说明**: Shopify 没有提供直接发送自定义邮件的 GraphQL API

---

### 2️⃣ Vercel 邮件发送能力

#### ❌ Vercel **不直接支持** SMTP

Vercel Serverless Functions 的限制：

| 功能 | 是否支持 | 原因 |
|------|---------|------|
| SMTP 发送 | ❌ | 不支持持久连接 |
| 第三方邮件服务 | ✅ | 通过 API（SendGrid、Mailgun 等） |
| 执行时间 | ⚠️ 最长 10 秒（免费版） | 发送邮件可能超时 |

#### 使用第三方邮件服务的成本

**SendGrid**:
- 免费额度: 100 封/天
- 付费: $19.95/月起

**Mailgun**:
- 免费额度: 5,000 封/月
- 付费: $35/月起

**Resend** (推荐给开发者):
- 免费额度: 3,000 封/月
- 付费: $20/月起

---

### 3️⃣ 当前方案：`mailto:` 协议

#### ✅ 优势

| 优势 | 说明 |
|------|------|
| 🆓 **完全免费** | 无需任何第三方服务 |
| 🔓 **无需额外权限** | 使用浏览器标准协议 |
| ⚡ **实施简单** | 无需复杂配置 |
| 🔒 **更安全** | 客服从自己的邮箱发送 |
| ✏️ **可编辑** | 发送前可以修改内容 |
| 📧 **专业性** | 从公司邮箱发送更正规 |

#### ⚠️ 劣势

| 劣势 | 说明 | 解决方案 |
|------|------|---------|
| 需要手动点击"发送" | 不是全自动 | ✅ 已实现一键打开邮件客户端 |
| 依赖本地邮件客户端 | 需要配置邮箱 | ✅ 提供复制功能作为备选 |
| 无发送记录 | 系统不知道是否发送 | ⚠️ 可以通过邮箱的已发送文件夹查看 |

---

## 🤔 为什么不使用 Shopify 发送邮件？

### 原因 1: 权限限制

当前 API 权限配置（`env.example` 第 26-32 行）：

```bash
# 当前拥有的权限
- read_files       # 读取文件 ✅
- write_files      # 写入文件 ✅
- read_products    # 读取产品 ✅
- write_products   # 写入产品 ✅
- read_customers   # 读取客户 ✅

# 没有的权限（也不需要）
- write_customers  # 修改客户信息 ❌
- write_draft_orders  # 创建草稿订单 ❌
```

**Shopify 没有提供**发送自定义邮件的权限范围（scope）。

---

### 原因 2: Shopify 不提供邮件 API

检查 Shopify Admin API 文档：

| API 类型 | 是否存在 | 用途 |
|---------|---------|------|
| `DraftOrder` | ✅ 存在 | 创建草稿订单（会触发订单邮件） |
| `Order` | ✅ 存在 | 创建订单（会触发订单邮件） |
| `CustomerEmailMarketing` | ✅ 存在 | 营销邮件订阅状态 |
| **`EmailSend`** | ❌ **不存在** | **无法发送自定义邮件** |

**结论**: Shopify GraphQL API 没有 `emailSend` 或类似的突变（mutation）。

---

### 原因 3: 可用方案的限制

#### 方案 A: 创建草稿订单
```javascript
mutation {
  draftOrderCreate(input: {
    customerId: "gid://shopify/Customer/123"
    lineItems: [...]
    email: "customer@example.com"
  }) {
    draftOrder {
      id
      invoiceUrl  # 发送给客户的链接
    }
  }
}
```

**问题**:
- ❌ 这会创建真实的订单记录
- ❌ 客户会看到两个订单（询价 + 草稿订单）
- ❌ 混淆客户和管理员
- ❌ 不符合"报价"的语义

---

#### 方案 B: 使用 Shopify Flow（自动化）
```
触发器: Metaobject 创建
条件: type = "quote" AND status = "Quoted"
动作: 发送邮件
```

**问题**:
- ❌ 需要 Shopify Plus 计划（$2000+/月）
- ❌ 当前商店计划不支持
- ❌ 成本过高

---

#### 方案 C: 使用 Shopify Email 应用
```
手动创建邮件模板 → 手动选择客户 → 手动发送
```

**问题**:
- ❌ 完全手动操作
- ❌ 无法自动化
- ❌ 比 `mailto:` 方案更麻烦

---

## 🎯 最佳方案对比

### 场景 1: 预算充足（推荐第三方服务）

**使用 SendGrid/Resend + Vercel**

```javascript
// api/send-email-smtp.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  await resend.emails.send({
    from: 'quotes@your-company.com',
    to: req.body.customerEmail,
    subject: '您的报价单',
    html: `<p>订单号: ${req.body.orderId}</p>...`
  });
  
  return res.json({ success: true });
}
```

**成本**: $20-35/月

**优势**:
- ✅ 完全自动化
- ✅ 有发送记录
- ✅ 专业邮件服务器（不会进垃圾箱）
- ✅ 支持追踪（已读、点击）

**劣势**:
- ❌ 需要支付费用
- ❌ 需要配置域名验证
- ❌ 需要额外的账号管理

---

### 场景 2: 预算有限（当前方案）

**使用 `mailto:` 协议**

**成本**: $0

**优势**:
- ✅ 完全免费
- ✅ 无需额外配置
- ✅ 从客服自己的邮箱发送（更专业）
- ✅ 客服可以在发送前检查和修改

**劣势**:
- ⚠️ 需要手动点击"发送"
- ⚠️ 依赖本地邮件客户端

**当前实现**:
```javascript
// templates/page.admin-dashboard.liquid
function openMailClient(mailtoLink, emailData) {
  // 1. 打开邮件客户端
  window.location.href = mailtoLink;
  
  // 2. 检测是否成功打开
  setTimeout(() => {
    if (document.hasFocus()) {
      // 未成功打开，显示提示
      alert('无法打开邮件客户端...');
    }
  }, 1000);
}
```

---

### 场景 3: Shopify Plus 用户

**使用 Shopify Flow**

**成本**: 包含在 Shopify Plus 中

**实现**:
1. 创建 Flow 工作流
2. 触发器: Metaobject 状态更改为 "Quoted"
3. 动作: 发送邮件模板

**优势**:
- ✅ 完全自动化
- ✅ 集成在 Shopify 后台
- ✅ 无需外部服务

**劣势**:
- ❌ 需要 Shopify Plus（$2000+/月）
- ❌ 当前商店不适用

---

## 📋 权限检查清单

### 当前拥有的 Shopify API 权限

查看你的 Shopify Admin API 应用配置：

1. 登录 Shopify 后台
2. 设置 → 应用和销售渠道 → 开发应用
3. 选择你的应用
4. 查看"Admin API 访问范围"

**当前配置的权限**（根据 `env.example`）:
- ✅ `read_files`
- ✅ `write_files`
- ✅ `read_products`
- ✅ `write_products`
- ✅ `read_customers`

**邮件相关的权限**（如果存在）:
- ❌ `write_emails` - **不存在此权限**
- ❌ `send_notifications` - **不存在此权限**

**结论**: Shopify 没有提供发送自定义邮件的 API 权限。

---

## 🚀 如果想升级到自动邮件发送

### 推荐方案：使用 Resend

#### 步骤 1: 注册 Resend

1. 访问 https://resend.com
2. 注册账号（免费 3,000 封/月）
3. 验证域名（或使用测试域名）
4. 获取 API Key

#### 步骤 2: 安装依赖

```bash
npm install resend
```

#### 步骤 3: 创建新的邮件 API

```javascript
// api/send-email-auto.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { orderId, customerEmail, amount, files, note } = req.body;
  
  try {
    // 发送邮件
    const data = await resend.emails.send({
      from: 'quotes@your-domain.com', // 必须是验证过的域名
      to: customerEmail,
      subject: `报价单 #${orderId}`,
      html: `
        <h2>您的报价单</h2>
        <p><strong>订单号:</strong> ${orderId}</p>
        <p><strong>报价金额:</strong> ¥${amount}</p>
        ${note ? `<p><strong>备注:</strong> ${note}</p>` : ''}
        <h3>文件列表:</h3>
        <ul>
          ${files.map(f => `<li>${f.fileName}</li>`).join('')}
        </ul>
        <p>请联系我们确认订单。</p>
      `
    });
    
    return res.json({ 
      success: true, 
      emailId: data.id 
    });
    
  } catch (error) {
    console.error('发送邮件失败:', error);
    return res.status(500).json({ 
      error: '发送失败',
      message: error.message 
    });
  }
}
```

#### 步骤 4: 配置环境变量

在 Vercel 后台添加：
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
```

#### 步骤 5: 修改前端调用

```javascript
// templates/page.admin-dashboard.liquid
async function sendQuoteEmail(orderId, customerEmail, amount, files, note, senderEmail) {
  const response = await fetch('https://shopify-13s4.vercel.app/api/send-email-auto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      customerEmail,
      amount,
      files,
      note
    })
  });
  
  if (response.ok) {
    alert('✅ 邮件已自动发送！');
  } else {
    alert('❌ 发送失败');
  }
}
```

**成本**: 免费（3000 封/月内）或 $20/月

---

## 📊 总结表

| 方案 | 自动化 | 成本 | 权限要求 | 实施难度 | 推荐度 |
|------|-------|------|---------|---------|-------|
| **当前 `mailto:`** | ⚠️ 半自动 | 🆓 免费 | ✅ 无 | ⭐ 简单 | ⭐⭐⭐⭐⭐ |
| Resend/SendGrid | ✅ 全自动 | 💰 $20-35/月 | ✅ 无 | ⭐⭐ 中等 | ⭐⭐⭐⭐ |
| Shopify Flow | ✅ 全自动 | 💰💰💰 $2000+/月 | ❌ Shopify Plus | ⭐⭐⭐ 复杂 | ⭐⭐ |
| Shopify API | ❌ 不可用 | - | ❌ 不存在 | - | ❌ |
| 手动发送 | ❌ 完全手动 | 🆓 免费 | ✅ 无 | ⭐ 简单 | ⭐ |

---

## 🎯 针对你的问题的最终答案

### Q1: Shopify 服务器支持发送邮件吗？

**A**: 支持，但有限制：
- ✅ 支持发送系统邮件（订单、发货等）
- ⚠️ 不支持通过 API 发送自定义邮件
- ❌ 没有 `emailSend` 这样的 GraphQL API

### Q2: 是不是因为没有 Shopify 服务器的权限？

**A**: 不是权限问题，而是功能不存在：
- ✅ 你已经有足够的权限访问 Shopify API
- ❌ Shopify API 本身就没有提供发送自定义邮件的功能
- ✅ 这不是权限限制，而是平台功能限制

### Q3: 为什么使用 `mailto:` 而不是自动发送？

**A**: 
1. **成本考虑**: `mailto:` 完全免费，自动发送需要 $20-35/月
2. **实施简单**: 无需额外配置和账号
3. **更专业**: 从客服自己的邮箱发送更正规
4. **可控性**: 客服可以在发送前检查和修改内容

### Q4: 如果要升级到自动发送，怎么做？

**A**: 推荐使用 Resend（免费 3000 封/月）:
1. 注册 Resend 账号
2. 安装 `resend` npm 包
3. 创建 `api/send-email-auto.js`
4. 配置 API Key
5. 修改前端调用

**预计工作量**: 1-2 小时  
**月成本**: 免费（3000 封内）

---

**文档版本**: 1.0  
**最后更新**: 2025-01-29  
**相关文档**: 
- [3.SYSTEM_WORKFLOW.md](./3.SYSTEM_WORKFLOW.md)
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)

