# 📋 草稿订单方案澄清

## 🤔 用户的理解

> "shopify只能后台draft order创建订单，通告邮件发送给客户"

## ✅ 实际情况

### Shopify 确实支持通过 API 创建草稿订单！

**两种方式**：

#### 方式 1: 手动创建（后台）
- 在 Shopify 后台 → 订单 → 创建订单
- 手动填写信息
- 点击"发送发票"
- ✅ 简单直观
- ❌ 无法自动化

#### 方式 2: API 创建（自动化）⭐
- 使用 Shopify Admin API
- GraphQL `draftOrderCreate` 突变
- REST `POST /admin/api/2024-07/draft_orders.json`
- ✅ 可以自动化
- ✅ 客户点击"立即下单"后自动创建
- ✅ 返回 `invoiceUrl` 发送给客户

---

## 🔍 API 确认

### GraphQL API (推荐)

**是否存在**: ✅ **存在**

```graphql
mutation {
  draftOrderCreate(input: {
    customerId: "gid://shopify/Customer/123"
    lineItems: [
      {
        title: "定制产品"
        quantity: 1
        originalUnitPrice: "1500.00"
      }
    ]
    email: "customer@example.com"
  }) {
    draftOrder {
      id
      name
      invoiceUrl  # ← 关键：客户付款链接
      totalPrice
    }
    userErrors {
      field
      message
    }
  }
}
```

**API 文档**: 
- https://shopify.dev/docs/api/admin-graphql/2024-07/mutations/draftOrderCreate

---

### REST API (备选)

**是否存在**: ✅ **存在**

```bash
POST https://your-store.myshopify.com/admin/api/2024-07/draft_orders.json

{
  "draft_order": {
    "line_items": [{
      "title": "定制产品",
      "price": "1500.00",
      "quantity": 1
    }],
    "customer": {
      "email": "customer@example.com"
    },
    "email": "customer@example.com"
  }
}

# 响应
{
  "draft_order": {
    "id": 1234567890,
    "invoice_url": "https://checkout.shopify.com/...",  # ← 付款链接
    "status": "open"
  }
}
```

**API 文档**:
- https://shopify.dev/docs/api/admin-rest/2024-07/resources/draftorder

---

## 🎯 所以，你的方案完全可行！

### 修正后的流程

```
阶段 1: 询价阶段
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
客户上传文件
  ↓
提交询价 (存储到 Metaobject)
  ↓
客服添加报价
  ↓
发送邮件通知客户


阶段 2: 下单阶段
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
客户点击"立即下单"
  ↓
前端调用 /api/create-draft-order
  ↓
后端调用 Shopify API:
  draftOrderCreate(...)
  ↓
Shopify 返回 invoiceUrl
  ↓
前端跳转到 invoiceUrl
  ↓
客户在 Shopify 结账页面付款
  ↓
状态: 待付款 → 已付款
```

---

## 🛠️ 需要的 API 权限

在 Shopify 后台添加权限：

1. 设置 → 应用和销售渠道 → 开发应用
2. 选择你的应用
3. 配置 Admin API 访问范围
4. 添加：
   - ✅ `write_draft_orders` - 创建草稿订单
   - ✅ `read_draft_orders` - 读取草稿订单
   - ✅ `read_customers` - 查找客户（可选）
5. 保存并重新安装应用

---

## 💡 关于"通告邮件"

### 误解澄清

你可能理解的是：
> "只能在后台手动创建草稿订单，然后 Shopify 自动发邮件给客户"

### 实际情况

**两种邮件发送方式**：

#### 方式 1: Shopify 自动发送（后台手动创建时）
- 在后台创建草稿订单
- 点击"发送发票"
- Shopify 自动发邮件
- ✅ 简单
- ❌ 无法自动化

#### 方式 2: 你自己发送（API 创建时）⭐
- 通过 API 创建草稿订单
- API 返回 `invoiceUrl`
- **你自己**通过邮件/短信/页面跳转发送给客户
- ✅ 灵活（可以自定义邮件内容）
- ✅ 可以自动化
- ✅ 可以直接跳转（无需邮件）

---

## 🎯 推荐方案：直接跳转（无需邮件）

### 更好的用户体验

```javascript
// 客户点击"立即下单"
async function createOrder(quote) {
  // 1. 调用你的 API 创建草稿订单
  const response = await fetch('/api/create-draft-order', {
    method: 'POST',
    body: JSON.stringify({
      quoteId: quote.id,
      customerEmail: quote.email,
      amount: quote.amount
    })
  });
  
  const result = await response.json();
  
  // 2. 直接跳转到 Shopify 结账页面（无需邮件！）
  window.location.href = result.invoiceUrl;
  
  // 客户立即进入付款页面，体验流畅！
}
```

**优势**：
- ✅ 无需等待邮件
- ✅ 客户点击后立即进入付款页面
- ✅ 用户体验最佳
- ✅ 减少流失率

---

## 📊 三种方案对比

### 方案 A: 后台手动创建 + Shopify 发邮件

```
客服操作:
1. 在 Shopify 后台创建草稿订单
2. 手动输入价格、产品信息
3. 点击"发送发票"
4. Shopify 自动发邮件给客户

客户操作:
5. 收到邮件
6. 点击邮件中的链接
7. 进入付款页面
```

**评价**:
- ❌ 完全手动，无法自动化
- ❌ 客服工作量大
- ❌ 容易出错
- ⚠️ 推荐度: ⭐⭐

---

### 方案 B: API 自动创建 + 你发邮件

```
客户操作:
1. 点击"立即下单"

系统操作:
2. 调用 API 创建草稿订单
3. 获取 invoiceUrl
4. 通过你的邮件系统发送给客户

客户操作:
5. 收到邮件
6. 点击邮件中的链接
7. 进入付款页面
```

**评价**:
- ✅ 自动化
- ⚠️ 需要配置邮件服务（SendGrid 等）
- ⚠️ 客户需要等待邮件
- ⚠️ 推荐度: ⭐⭐⭐

---

### 方案 C: API 自动创建 + 直接跳转（推荐）⭐⭐⭐⭐⭐

```
客户操作:
1. 点击"立即下单"

系统操作:
2. 调用 API 创建草稿订单
3. 获取 invoiceUrl
4. 直接跳转到 invoiceUrl

客户操作:
5. 立即看到付款页面
6. 完成付款
```

**评价**:
- ✅ 全自动
- ✅ 无需邮件服务
- ✅ 用户体验最佳（无需等待）
- ✅ 实施简单
- ✅ 推荐度: ⭐⭐⭐⭐⭐

---

## 🎬 完整代码示例

### 后端 API: `api/create-draft-order.js`

```javascript
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const endpoint = `https://${storeDomain}/admin/api/2024-07/graphql.json`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  
  return await resp.json();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const { quoteId, customerEmail, amount, files, note } = req.body;
  
  try {
    // 创建草稿订单
    const mutation = `
      mutation($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            totalPrice
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variables = {
      input: {
        email: customerEmail,
        lineItems: [{
          title: `定制产品 - ${quoteId}`,
          quantity: 1,
          originalUnitPrice: amount.toString(),
          customAttributes: [
            { key: "询价单号", value: quoteId },
            { key: "文件", value: files.map(f => f.fileName).join(', ') }
          ]
        }],
        note: `询价单: ${quoteId}\n${note || ''}`,
        tags: ['quote', quoteId]
      }
    };
    
    const result = await shopGql(mutation, variables);
    
    if (result.data.draftOrderCreate.userErrors.length > 0) {
      return res.status(400).json({
        error: '创建订单失败',
        details: result.data.draftOrderCreate.userErrors
      });
    }
    
    const draftOrder = result.data.draftOrderCreate.draftOrder;
    
    return res.json({
      success: true,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl,  // ← 关键：返回付款链接
      totalPrice: draftOrder.totalPrice
    });
    
  } catch (error) {
    console.error('创建草稿订单失败:', error);
    return res.status(500).json({ error: error.message });
  }
}
```

---

### 前端代码: `templates/page.my-quotes.liquid`

```liquid
<script>
  async function createOrderFromQuote(quote) {
    try {
      const btn = document.getElementById('order-btn');
      btn.disabled = true;
      btn.textContent = '⏳ 创建订单中...';
      
      // 1. 调用后端 API 创建草稿订单
      const response = await fetch('https://shopify-13s4.vercel.app/api/create-draft-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.handle,
          customerEmail: quote.email,
          amount: quote.amount,
          files: quote.files,
          note: quote.note
        })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        // 2. 更新 Metaobject 状态
        await fetch('https://shopify-13s4.vercel.app/api/quotes?handle=' + quote.handle, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'Ordered',
            draftOrderId: result.draftOrderId,
            orderedAt: new Date().toISOString()
          })
        });
        
        // 3. 直接跳转到 Shopify 付款页面（无需邮件！）
        window.location.href = result.invoiceUrl;
      } else {
        alert('❌ 创建订单失败: ' + (result.error || '未知错误'));
        btn.disabled = false;
        btn.textContent = '🛒 立即下单';
      }
      
    } catch (error) {
      console.error('创建订单失败:', error);
      alert('❌ 创建订单失败，请联系客服');
    }
  }
</script>
```

---

## ✅ 总结

### 你的理解 vs 实际情况

| 项目 | 你的理解 | 实际情况 |
|------|---------|---------|
| **API 创建** | ❌ 不支持 | ✅ **完全支持** |
| **邮件发送** | 必须通过 Shopify | 可以自己发，或直接跳转（更好） |
| **实施难度** | 认为很复杂 | 实际很简单（3-4 小时） |

---

### 推荐方案

**方案 C: API 自动创建 + 直接跳转**

**理由**:
- ✅ 完全自动化
- ✅ 用户体验最佳
- ✅ 无需邮件服务
- ✅ 实施简单
- ✅ 成本为零

---

## 🚀 下一步

我可以立即帮你实现**方案 C**：

1. ✅ 创建 `api/create-draft-order.js`
2. ✅ 创建 `templates/page.my-quotes.liquid`
3. ✅ 修改 `assets/model-uploader.js`
4. ✅ 提供详细的部署和测试指南

**需要我开始实施吗？** 🎯

