# 🎯 最终方案：使用 Draft Order 实现完整报价流程

## 💡 核心思路

利用 Shopify Draft Order 的特性：
- ✅ 创建时设置初始价格（如 ¥0.01）
- ✅ 客服可以更新价格、数量、折扣
- ✅ 客服可以修改状态（通过自定义字段）
- ✅ 客户确认后完成支付
- ✅ 支付后自动转为正式订单

---

## 🔄 完整流程

### 阶段 1️⃣：客户提交询价

```
客户操作：
1. 上传 3D 模型文件
2. 填写参数（数量、材质等）
3. 点击"提交询价"

系统操作：
4. 上传文件到 Shopify Files
5. 立即创建 Draft Order（价格 = ¥0.01，占位）
6. 将 Draft Order ID 存储到 Metaobject
7. 跳转到"我的询价"页面

数据存储：
- Shopify Files: 文件
- Draft Order: 订单框架（待报价）
- Metaobject: 关联信息（文件ID、状态等）
```

**关键变化**：
- ✅ 询价时**立即创建** Draft Order（不是等客服报价后）
- ✅ 初始价格设为占位价格（¥0.01）
- ✅ Draft Order 状态为"open"（草稿）

---

### 阶段 2️⃣：客服添加报价

```
客服操作：
1. 在管理后台查看待报价订单
2. 点击"添加报价"
3. 输入报价金额（如 ¥1,500）
4. 输入备注
5. 点击"发送报价"

系统操作：
6. 调用 draftOrderUpdate API
7. 更新 lineItems[0].price = 1500
8. 更新 customAttributes（报价时间、状态等）
9. 更新 Metaobject 状态为"Quoted"
10. 发送邮件通知客户
```

**关键点**：
- ✅ 使用 `draftOrderUpdate` 更新价格
- ✅ Draft Order 仍然是"open"状态
- ✅ 客户还未付款

---

### 阶段 3️⃣：客户查看并下单

```
客户操作：
1. 收到邮件或访问"我的询价"页面
2. 看到报价金额 ¥1,500
3. 点击"立即下单"

系统操作：
4. 跳转到 Draft Order 的 invoiceUrl
5. 客户在 Shopify 结账页面完成支付
6. Draft Order 自动转为正式订单
7. 状态变为"待发货"
```

**关键点**：
- ✅ 客户看到的是更新后的价格
- ✅ 标准的 Shopify 结账流程
- ✅ 支付后自动转为正式订单

---

## 🆚 新方案 vs 旧方案对比

| 对比项 | 旧方案（Metaobject） | 新方案（Draft Order） |
|-------|-------------------|---------------------|
| **询价存储** | Metaobject | Draft Order + Metaobject |
| **创建时机** | 客户提交时 | 客户提交时 |
| **价格修改** | 修改 Metaobject | 修改 Draft Order |
| **客户查看** | 自定义页面读取 Metaobject | 直接查看 Draft Order |
| **下单方式** | 创建新订单 | 直接付款 Draft Order |
| **订单关联** | 手动关联 | 自动关联 |
| **数据一致性** | ⚠️ 需要同步 | ✅ 天然一致 |
| **推荐度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 💻 技术实现

### 1. 客户提交询价 - 创建 Draft Order

#### API: `api/submit-quote.js` (修改 `upload-file.js`)

```javascript
/**
 * 客户提交询价
 * 1. 上传文件到 Shopify Files
 * 2. 创建 Draft Order（占位价格）
 * 3. 创建 Metaobject（存储关联信息）
 */

export default async function handler(req, res) {
  // CORS...
  
  const { fileName, fileData, customerEmail, quantity, material } = req.body;
  
  try {
    // ========== 步骤 1: 上传文件 ==========
    // ... (保持原有的文件上传逻辑)
    const fileId = 'gid://shopify/File/...';
    const cdnUrl = 'https://...';
    
    // ========== 步骤 2: 创建 Draft Order ==========
    const draftOrderMutation = `
      mutation($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
          }
          userErrors { field message }
        }
      }
    `;
    
    const draftOrderInput = {
      email: customerEmail,
      lineItems: [{
        title: `定制产品 - ${fileName}`,
        quantity: parseInt(quantity) || 1,
        originalUnitPrice: "0.01",  // ← 占位价格，等待客服报价
        customAttributes: [
          { key: "文件名", value: fileName },
          { key: "材质", value: material },
          { key: "状态", value: "待报价" },
          { key: "_fileId", value: fileId },
          { key: "_fileCdnUrl", value: cdnUrl }
        ]
      }],
      note: `询价单 - 等待报价\n提交时间: ${new Date().toISOString()}`,
      tags: ['quote', 'pending']
    };
    
    const draftOrderResult = await shopGql(draftOrderMutation, {
      input: draftOrderInput
    });
    
    if (draftOrderResult.data.draftOrderCreate.userErrors.length > 0) {
      throw new Error('创建草稿订单失败');
    }
    
    const draftOrder = draftOrderResult.data.draftOrderCreate.draftOrder;
    
    // ========== 步骤 3: 创建 Metaobject（存储额外信息） ==========
    const metaobjectMutation = `
      mutation($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { field message }
        }
      }
    `;
    
    const metaobjectInput = {
      type: "quote",
      fields: [
        { key: "handle", value: draftOrder.name },  // 如 #D1001
        { key: "email", value: customerEmail },
        { key: "status", value: "Pending" },
        { key: "draft_order_id", value: draftOrder.id },
        { key: "invoice_url", value: draftOrder.invoiceUrl },
        { key: "file_id", value: fileId },
        { key: "file_cdn_url", value: cdnUrl },
        { key: "created_at", value: new Date().toISOString() }
      ]
    };
    
    const metaobjectResult = await shopGql(metaobjectMutation, {
      metaobject: metaobjectInput
    });
    
    // ========== 返回结果 ==========
    return res.json({
      success: true,
      quoteId: draftOrder.name,  // #D1001
      draftOrderId: draftOrder.id,
      invoiceUrl: draftOrder.invoiceUrl,
      message: '询价提交成功，等待客服报价'
    });
    
  } catch (error) {
    console.error('提交询价失败:', error);
    return res.status(500).json({ error: error.message });
  }
}
```

**关键点**：
- ✅ 一次性创建 Draft Order 和 Metaobject
- ✅ Draft Order 存储订单信息
- ✅ Metaobject 存储关联和状态信息
- ✅ 两者通过 `draft_order_id` 关联

---

### 2. 客服添加报价 - 更新 Draft Order

#### API: `api/update-quote.js` (新建)

```javascript
/**
 * 客服添加报价
 * 1. 更新 Draft Order 价格
 * 2. 更新 Metaobject 状态
 * 3. 发送邮件通知客户
 */

export default async function handler(req, res) {
  // CORS...
  
  const { draftOrderId, amount, note } = req.body;
  
  try {
    // ========== 步骤 1: 更新 Draft Order 价格 ==========
    const updateMutation = `
      mutation($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            totalPrice
            lineItems(first: 10) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPrice
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `;
    
    // 获取现有的 line items
    const currentDraftOrderQuery = `
      query($id: ID!) {
        draftOrder(id: $id) {
          lineItems(first: 10) {
            edges {
              node {
                id
                title
                quantity
                customAttributes { key value }
              }
            }
          }
        }
      }
    `;
    
    const currentResult = await shopGql(currentDraftOrderQuery, {
      id: draftOrderId
    });
    
    const currentLineItem = currentResult.data.draftOrder.lineItems.edges[0].node;
    
    // 构建更新后的 line items
    const updateInput = {
      lineItems: [{
        title: currentLineItem.title,
        quantity: currentLineItem.quantity,
        originalUnitPrice: amount.toString(),  // ← 更新价格
        customAttributes: [
          ...currentLineItem.customAttributes.filter(attr => 
            !['状态', '报价金额', '报价时间', '备注'].includes(attr.key)
          ),
          { key: "状态", value: "已报价" },
          { key: "报价金额", value: `¥${amount}` },
          { key: "报价时间", value: new Date().toISOString() },
          { key: "备注", value: note || '' }
        ]
      }],
      note: `已报价: ¥${amount}\n${note || ''}`
    };
    
    const updateResult = await shopGql(updateMutation, {
      id: draftOrderId,
      input: updateInput
    });
    
    if (updateResult.data.draftOrderUpdate.userErrors.length > 0) {
      throw new Error('更新草稿订单失败');
    }
    
    const updatedDraftOrder = updateResult.data.draftOrderUpdate.draftOrder;
    
    // ========== 步骤 2: 更新 Metaobject 状态 ==========
    // 通过 draft_order_id 查找对应的 Metaobject
    const findMetaobjectQuery = `
      query($type: String!, $first: Int!, $query: String!) {
        metaobjects(type: $type, first: $first, query: $query) {
          edges {
            node {
              id
              handle
            }
          }
        }
      }
    `;
    
    const metaobjectResult = await shopGql(findMetaobjectQuery, {
      type: "quote",
      first: 1,
      query: `draft_order_id:${draftOrderId}`
    });
    
    if (metaobjectResult.data.metaobjects.edges.length > 0) {
      const metaobjectId = metaobjectResult.data.metaobjects.edges[0].node.id;
      
      const updateMetaobjectMutation = `
        mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject { id }
            userErrors { field message }
          }
        }
      `;
      
      await shopGql(updateMetaobjectMutation, {
        id: metaobjectId,
        metaobject: {
          fields: [
            { key: "status", value: "Quoted" },
            { key: "amount", value: amount.toString() },
            { key: "note", value: note || '' },
            { key: "quoted_at", value: new Date().toISOString() }
          ]
        }
      });
    }
    
    // ========== 步骤 3: 发送邮件 ==========
    // ... (调用现有的 send-email API)
    
    return res.json({
      success: true,
      draftOrderId: updatedDraftOrder.id,
      draftOrderName: updatedDraftOrder.name,
      invoiceUrl: updatedDraftOrder.invoiceUrl,
      totalPrice: updatedDraftOrder.totalPrice,
      message: '报价更新成功'
    });
    
  } catch (error) {
    console.error('更新报价失败:', error);
    return res.status(500).json({ error: error.message });
  }
}
```

**关键点**：
- ✅ 使用 `draftOrderUpdate` 更新价格
- ✅ 保留原有的 customAttributes
- ✅ 同步更新 Metaobject 状态
- ✅ Draft Order 仍然是"open"状态

---

### 3. 客户查看询价 - 读取 Draft Order

#### 前端: `templates/page.my-quotes.liquid`

```liquid
<div id="quote-details">
  <h2>我的询价单</h2>
  <div id="quote-content">加载中...</div>
</div>

<script>
  const API_BASE = 'https://shopify-13s4.vercel.app/api';
  
  async function loadQuote() {
    try {
      // 从 URL 获取询价单号（如 #D1001）
      const urlParams = new URLSearchParams(window.location.search);
      const quoteId = urlParams.get('id');
      
      if (!quoteId) {
        document.getElementById('quote-content').innerHTML = 
          '<p>❌ 未找到询价单号</p>';
        return;
      }
      
      // 获取 Draft Order 信息
      const response = await fetch(`${API_BASE}/get-draft-order?id=${quoteId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '加载失败');
      }
      
      const draftOrder = data.draftOrder;
      const lineItem = draftOrder.lineItems.edges[0].node;
      
      // 获取自定义属性
      const getAttr = (key) => {
        const attr = lineItem.customAttributes.find(a => a.key === key);
        return attr ? attr.value : '';
      };
      
      const status = getAttr('状态');
      const amount = lineItem.originalUnitPrice;
      const note = getAttr('备注');
      const fileName = getAttr('文件名');
      
      // 渲染页面
      let html = `
        <div class="quote-card">
          <div class="quote-header">
            <h3>询价单号: ${draftOrder.name}</h3>
            <span class="status ${status === '已报价' ? 'quoted' : 'pending'}">
              ${status === '已报价' ? '🟢 已报价' : '🟡 待报价'}
            </span>
          </div>
          
          <div class="quote-details">
            <p><strong>文件:</strong> ${fileName}</p>
            <p><strong>数量:</strong> ${lineItem.quantity}</p>
            <p><strong>材质:</strong> ${getAttr('材质')}</p>
      `;
      
      if (status === '已报价') {
        html += `
            <div class="quote-price">
              <h2>报价金额: ¥${amount}</h2>
              ${note ? `<p class="note">💬 ${note}</p>` : ''}
            </div>
            
            <button class="order-btn" onclick="proceedToCheckout('${draftOrder.invoiceUrl}')">
              🛒 立即下单
            </button>
            
            <p class="tip">点击"立即下单"后，您将进入 Shopify 结账页面完成支付</p>
        `;
      } else {
        html += `
            <div class="waiting">
              <p>💬 客服正在为您报价，请稍候...</p>
              <button onclick="location.reload()">🔄 刷新状态</button>
            </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
      
      document.getElementById('quote-content').innerHTML = html;
      
    } catch (error) {
      console.error('加载询价失败:', error);
      document.getElementById('quote-content').innerHTML = 
        `<p>❌ 加载失败: ${error.message}</p>`;
    }
  }
  
  function proceedToCheckout(invoiceUrl) {
    // 直接跳转到 Draft Order 的付款页面
    window.location.href = invoiceUrl;
  }
  
  // 页面加载时执行
  loadQuote();
</script>

<style>
  .quote-card {
    max-width: 600px;
    margin: 40px auto;
    padding: 30px;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  
  .quote-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 2px solid #f0f0f0;
  }
  
  .status {
    padding: 8px 16px;
    border-radius: 20px;
    font-weight: bold;
  }
  
  .status.pending {
    background: #fff3cd;
    color: #856404;
  }
  
  .status.quoted {
    background: #d4edda;
    color: #155724;
  }
  
  .quote-price {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin: 20px 0;
    text-align: center;
  }
  
  .quote-price h2 {
    color: #28a745;
    margin: 0 0 10px 0;
  }
  
  .order-btn {
    width: 100%;
    padding: 15px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    margin-top: 20px;
  }
  
  .order-btn:hover {
    background: #218838;
  }
  
  .tip {
    text-align: center;
    color: #666;
    font-size: 14px;
    margin-top: 10px;
  }
  
  .waiting {
    text-align: center;
    padding: 40px 20px;
  }
</style>
```

---

### 4. 后端 API - 获取 Draft Order

#### API: `api/get-draft-order.js` (新建)

```javascript
/**
 * 获取 Draft Order 详情
 * 用于客户查看询价状态和报价
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const { id } = req.query;  // Draft Order name (如 #D1001) 或 ID
  
  if (!id) {
    return res.status(400).json({ error: '缺少询价单号' });
  }
  
  try {
    // 方案 A: 通过 name 查找
    const query = `
      query($query: String!) {
        draftOrders(first: 1, query: $query) {
          edges {
            node {
              id
              name
              invoiceUrl
              totalPrice
              createdAt
              updatedAt
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    originalUnitPrice
                    customAttributes {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const result = await shopGql(query, {
      query: `name:${id}`
    });
    
    if (result.data.draftOrders.edges.length === 0) {
      return res.status(404).json({ error: '未找到询价单' });
    }
    
    const draftOrder = result.data.draftOrders.edges[0].node;
    
    return res.json({
      success: true,
      draftOrder: draftOrder
    });
    
  } catch (error) {
    console.error('获取询价失败:', error);
    return res.status(500).json({ error: error.message });
  }
}
```

---

## 📊 数据结构设计

### Draft Order 字段

```javascript
{
  id: "gid://shopify/DraftOrder/123456789",
  name: "#D1001",  // 询价单号
  status: "open",  // 草稿状态
  invoiceUrl: "https://checkout.shopify.com/...",  // 付款链接
  totalPrice: "1500.00",  // 总价（更新后）
  
  lineItems: [{
    title: "定制产品 - model.step",
    quantity: 1,
    originalUnitPrice: "1500.00",  // 报价金额（可更新）
    
    customAttributes: [
      { key: "文件名", value: "model.step" },
      { key: "材质", value: "ABS" },
      { key: "状态", value: "已报价" },  // 待报价 / 已报价
      { key: "报价金额", value: "¥1,500" },
      { key: "报价时间", value: "2025-01-29T10:30:00Z" },
      { key: "备注", value: "根据您的要求..." },
      { key: "_fileId", value: "gid://shopify/File/..." },
      { key: "_fileCdnUrl", value: "https://..." }
    ]
  }],
  
  note: "已报价: ¥1,500\n根据您的要求...",
  tags: ["quote", "pending"]
}
```

### Metaobject 字段（可选，用于额外管理）

```javascript
{
  type: "quote",
  handle: "D1001",
  fields: {
    email: "customer@example.com",
    status: "Quoted",  // Pending / Quoted / Ordered / Rejected
    draft_order_id: "gid://shopify/DraftOrder/123456789",
    invoice_url: "https://checkout.shopify.com/...",
    file_id: "gid://shopify/File/...",
    file_cdn_url: "https://...",
    amount: "1500",
    note: "根据您的要求...",
    created_at: "2025-01-29T10:00:00Z",
    quoted_at: "2025-01-29T10:30:00Z",
    ordered_at: null
  }
}
```

**说明**：
- Draft Order 存储订单核心数据（价格、商品）
- Metaobject 存储辅助数据（状态、关联信息）
- 两者通过 `draft_order_id` 关联

---

## ✅ 方案优势

### 与纯 Metaobject 方案对比

| 特性 | 纯 Metaobject | Draft Order + Metaobject |
|------|--------------|-------------------------|
| **数据一致性** | ⚠️ 需要手动同步 | ✅ 自动一致 |
| **价格修改** | 修改 Metaobject | 修改 Draft Order（原生） |
| **订单生成** | 创建新订单 | 直接转换 |
| **客户体验** | ⚠️ 自定义页面 | ✅ Shopify 原生结账 |
| **后台管理** | ⚠️ 看不到订单 | ✅ 后台可见草稿订单 |
| **订单关联** | ⚠️ 手动关联 | ✅ 自动关联 |
| **报表统计** | ⚠️ 需要自己实现 | ✅ Shopify 自带 |

---

## 🚀 实施步骤

### 第 1 步：添加 API 权限

在 Shopify 后台：
1. 设置 → 应用和销售渠道 → 开发应用
2. 配置 Admin API 访问范围
3. 添加权限：
   - ✅ `write_draft_orders`
   - ✅ `read_draft_orders`
   - ✅ `write_files`
   - ✅ `read_files`
4. 保存并重新安装应用

---

### 第 2 步：修改/创建文件

**新建文件**：
1. `api/submit-quote.js` - 提交询价（创建 Draft Order）
2. `api/update-quote.js` - 更新报价（更新 Draft Order）
3. `api/get-draft-order.js` - 获取询价详情
4. `templates/page.my-quotes.liquid` - 客户查看询价页面

**修改文件**：
1. `assets/model-uploader.js` - 调用新的 submit-quote API
2. `templates/page.admin-dashboard.liquid` - 调用新的 update-quote API

**保留文件**：
1. `api/upload-file.js` - 文件上传逻辑可以复用
2. `api/send-email.js` - 邮件通知功能保持不变

---

### 第 3 步：测试流程

**测试清单**：
- [ ] 客户提交询价（创建 Draft Order）
- [ ] 后台可以看到草稿订单
- [ ] 客服添加报价（更新 Draft Order 价格）
- [ ] 客户查看询价（显示更新后的价格）
- [ ] 客户点击"立即下单"（跳转到付款页面）
- [ ] 客户完成支付（Draft Order 转为正式订单）
- [ ] 后台订单状态更新

---

## 🎯 总结

### 你的方案完美！

✅ **使用 Draft Order 的更新功能**是最佳方案：

1. **符合 Shopify 规则** - 不修改已支付订单
2. **数据一致性** - Draft Order 是唯一数据源
3. **原生体验** - 使用 Shopify 原生结账流程
4. **易于管理** - 后台可以直接看到草稿订单
5. **自动转换** - 支付后自动转为正式订单

---

## 📋 下一步

我可以：

**选项 A**: 立即实施完整方案（创建所有文件）  
**选项 B**: 先实施核心功能（创建 + 更新 Draft Order）  
**选项 C**: 展示更详细的代码示例

请告诉我你的选择！🎯

