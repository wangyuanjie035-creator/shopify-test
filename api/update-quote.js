/**
 * ═══════════════════════════════════════════════════════════════
 * 更新报价 API - 客服修改 Draft Order 价格
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：客服添加报价，更新 Draft Order 的价格和状态
 * 
 * 流程：
 * 1. 查询现有 Draft Order 的详情
 * 2. 更新 lineItems 的价格
 * 3. 更新 customAttributes（状态、报价金额、备注）
 * 4. 同步更新 Metaobject 状态
 * 5. 返回更新后的信息
 * 
 * 请求示例：
 * POST /api/update-quote
 * {
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789",
 *   "amount": 1500,
 *   "note": "根据您的要求，我们的报价如下..."
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789",
 *   "draftOrderName": "#D1001",
 *   "invoiceUrl": "https://checkout.shopify.com/...",
 *   "totalPrice": "1500.00"
 * }
 */

// ─────────────────────────────────────────────────────────────
// 辅助函数：调用 Shopify GraphQL API
// ─────────────────────────────────────────────────────────────
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
  
  if (!storeDomain || !accessToken) {
    throw new Error('缺少 Shopify 配置');
  }
  
  const endpoint = `https://${storeDomain}/admin/api/2024-01/graphql.json`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  
  if (!resp.ok) {
    throw new Error(`Shopify API 请求失败: ${resp.status}`);
  }
  
  const json = await resp.json();
  
  if (json.errors) {
    console.error('GraphQL 错误:', json.errors);
    throw new Error(`GraphQL 错误: ${json.errors[0].message}`);
  }
  
  return json;
}

// ─────────────────────────────────────────────────────────────
// 主处理函数
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // 设置 CORS 头 - 允许Shopify域名
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // 只接受 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { draftOrderId, amount, note, senderEmail, status } = req.body;
  
  // 验证必填字段
  // 如果 status 是"无法加工"，amount 可以为 0
  if (!draftOrderId || (amount === undefined && status !== '无法加工')) {
    return res.status(400).json({
      error: '缺少必填字段',
      required: ['draftOrderId', 'amount']
    });
  }
  
  try {
    // ═══════════════════════════════════════════════════════════
    // 步骤 1: 查询现有 Draft Order 的详情
    // ═══════════════════════════════════════════════════════════
    
    const getDraftOrderQuery = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          invoiceUrl
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
    `;
    
    const currentResult = await shopGql(getDraftOrderQuery, {
      id: draftOrderId
    });
    
    if (!currentResult.data.draftOrder) {
      return res.status(404).json({ error: '未找到草稿订单' });
    }
    
    const currentDraftOrder = currentResult.data.draftOrder;
    const currentLineItem = currentDraftOrder.lineItems.edges[0].node;
    
    // ═══════════════════════════════════════════════════════════
    // 步骤 2: 更新 Draft Order 价格
    // ═══════════════════════════════════════════════════════════
    
    const updateMutation = `
      mutation($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            totalPrice
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    // 保留原有的属性，更新状态相关的属性
    const updatedAttributes = [
      // 保留原有属性（过滤掉状态相关的）
      ...currentLineItem.customAttributes.filter(attr => 
        !['状态', '报价金额', '报价时间', '备注', '客服邮箱'].includes(attr.key)
      )
    ];
    
    // 根据 status 设置订单状态
    const orderStatus = status === '无法加工' ? '无法加工' : '已报价';
    updatedAttributes.push({ key: "状态", value: orderStatus });
    
    if (orderStatus === '无法加工') {
      // 无法加工时，价格设为0，不设置报价金额
      updatedAttributes.push({ key: "报价时间", value: new Date().toISOString() });
    } else {
      // 正常报价时，设置报价金额
      updatedAttributes.push({ key: "报价金额", value: `¥${amount}` });
      updatedAttributes.push({ key: "报价时间", value: new Date().toISOString() });
    }
    
    // 添加备注（如果有）
    if (note) {
      updatedAttributes.push({ key: "备注", value: note });
    }
    
    // 添加客服邮箱（如果有）
    if (senderEmail) {
      updatedAttributes.push({ key: "客服邮箱", value: senderEmail });
    }
    
    // 设置价格：无法加工时为0，否则使用传入的amount 作为【总价】
    const quantity = currentLineItem.quantity || 1;
    const finalAmount = orderStatus === '无法加工' ? 0 : amount; // 订单总价
    const unitPrice = orderStatus === '无法加工'
      ? 0
      : (amount / quantity); // 平均到每件，避免被数量再次放大
    
    const updateInput = {
      taxExempt: true, // 免除税费，确保价格准确
      lineItems: [{
        title: currentLineItem.title,
        quantity: currentLineItem.quantity,
        // Shopify 的 total = originalUnitPrice * quantity，所以这里用总价 / 数量
        originalUnitPrice: unitPrice.toString(),
        customAttributes: updatedAttributes
      }],
      note: orderStatus === '无法加工' 
        ? `无法加工\n时间: ${new Date().toLocaleString('zh-CN')}\n${note || ''}`
        : `已报价总价: ¥${amount}\n折算单价: ¥${unitPrice.toFixed(2)}\n报价时间: ${new Date().toLocaleString('zh-CN')}\n${note || ''}`
    };
    
    const updateResult = await shopGql(updateMutation, {
      id: draftOrderId,
      input: updateInput
    });
    
    if (updateResult.data.draftOrderUpdate.userErrors.length > 0) {
      throw new Error('更新草稿订单失败: ' + updateResult.data.draftOrderUpdate.userErrors[0].message);
    }
    
    const updatedDraftOrder = updateResult.data.draftOrderUpdate.draftOrder;
    
    // ═══════════════════════════════════════════════════════════
    // 步骤 3: 同步更新 Metaobject 状态
    // ═══════════════════════════════════════════════════════════
    
    try {
      // 通过 draft_order_id 查找 Metaobject
      const findMetaobjectQuery = `
        query($type: String!, $first: Int!) {
          metaobjects(type: $type, first: $first) {
            edges {
              node {
                id
                handle
                fields {
                  key
                  value
                }
              }
            }
          }
        }
      `;
      
      const metaobjectResult = await shopGql(findMetaobjectQuery, {
        type: "quote",
        first: 100  // 获取所有 quote
      });
      
      // 找到匹配的 Metaobject
      const matchingMetaobject = metaobjectResult.data.metaobjects.edges.find(edge => {
        const draftOrderIdField = edge.node.fields.find(f => f.key === 'draft_order_id');
        return draftOrderIdField && draftOrderIdField.value === draftOrderId;
      });
      
      if (matchingMetaobject) {
        const metaobjectId = matchingMetaobject.node.id;
        
        const updateMetaobjectMutation = `
          mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
            metaobjectUpdate(id: $id, metaobject: $metaobject) {
              metaobject {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        await shopGql(updateMetaobjectMutation, {
          id: metaobjectId,
          metaobject: {
            fields: [
              { key: "status", value: orderStatus === '无法加工' ? "无法加工" : "已报价" },
              { key: "amount", value: (orderStatus === '无法加工' ? 0 : amount).toString() },
              { key: "note", value: note || '' },
              { key: "quoted_at", value: new Date().toISOString() }
            ]
          }
        });
        
      } else {
        console.warn('未找到对应的 Metaobject，跳过同步');
      }
    } catch (metaError) {
      console.warn('Metaobject 同步失败（非致命错误）:', metaError.message);
    }
    
    // ═══════════════════════════════════════════════════════════
    // 返回结果
    // ═══════════════════════════════════════════════════════════
    
    return res.json({
      success: true,
      draftOrderId: updatedDraftOrder.id,
      draftOrderName: updatedDraftOrder.name,
      invoiceUrl: updatedDraftOrder.invoiceUrl,
      totalPrice: updatedDraftOrder.totalPrice,
      customerEmail: currentDraftOrder.email,
      message: '报价更新成功',
      updatedAt: updatedDraftOrder.updatedAt
    });
    
  } catch (error) {
    console.error('更新报价失败:', error);
    return res.status(500).json({
      error: '更新报价失败',
      message: error.message
    });
  }
}

