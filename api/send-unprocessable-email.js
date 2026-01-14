import { setCorsHeaders } from '../utils/cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 发送"无法加工"通知邮件 API
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：通过Shopify Admin API发送"无法加工"通知邮件给客户
 * 
 * 注意：由于Shopify没有直接发送自定义邮件的API，我们使用
 * draftOrderInvoiceSend，但会在邮件中说明这是通知邮件，不包含付款链接
 * 
 * 请求示例：
 * POST /api/send-unprocessable-email
 * {
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789",
 *   "reason": "零件尺寸超出加工范围",
 *   "suggestion": "请将尺寸调整为XX以内",
 *   "orderName": "#D1001"
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "message": "通知邮件发送成功",
 *   "customerEmail": "customer@example.com"
 * }
 */

// 辅助函数：调用 Shopify GraphQL API
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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { draftOrderId, reason, suggestion, orderName } = req.body;

  // 验证必填字段
  if (!draftOrderId) {
    return res.status(400).json({
      error: '缺少必填字段',
      required: ['draftOrderId']
    });
  }

  try {
    // ═══════════════════════════════════════════════════════════
    // 步骤 1: 查询草稿订单信息
    // ═══════════════════════════════════════════════════════════
    
    const getDraftOrderQuery = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          invoiceUrl
          totalPrice
          note
        }
      }
    `;
    
    const currentResult = await shopGql(getDraftOrderQuery, {
      id: draftOrderId
    });
    
    if (!currentResult.data.draftOrder) {
      return res.status(404).json({ error: '未找到草稿订单' });
    }
    
    const draftOrder = currentResult.data.draftOrder;
    
    if (!draftOrder.email) {
      return res.status(400).json({ error: '草稿订单没有客户邮箱地址' });
    }

    // ═══════════════════════════════════════════════════════════
    // 步骤 2: 更新订单备注，包含无法加工的原因和建议
    // ═══════════════════════════════════════════════════════════
    
    // 构建邮件内容（会在发票邮件中显示）
    const emailNote = `无法加工通知

订单号：${orderName || draftOrder.name}

很抱歉通知您，您的询价订单暂时无法加工。

无法加工的原因：
${reason || '未提供原因'}

修改建议：
${suggestion || '未提供建议'}

请您根据以上建议调整后重新提交询价，如有疑问欢迎直接回复此邮件与我们联系。

感谢您的理解与配合！`;

    // 更新订单备注（这样邮件中会包含这些信息）
    const updateDraftOrderMutation = `
      mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            id
            name
            note
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    await shopGql(updateDraftOrderMutation, {
      id: draftOrderId,
      input: {
        note: emailNote
      }
    });

    // ═══════════════════════════════════════════════════════════
    // 步骤 3: 发送发票邮件（虽然叫发票邮件，但内容是我们自定义的）
    // ═══════════════════════════════════════════════════════════
    
    const sendInvoiceMutation = `
      mutation draftOrderInvoiceSend($id: ID!) {
        draftOrderInvoiceSend(id: $id) {
          draftOrder {
            id
            name
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const sendInvoiceResult = await shopGql(sendInvoiceMutation, {
      id: draftOrderId
    });
    
    if (sendInvoiceResult.data.draftOrderInvoiceSend.userErrors.length > 0) {
      throw new Error('发送通知邮件失败: ' + sendInvoiceResult.data.draftOrderInvoiceSend.userErrors[0].message);
    }
    
    // ═══════════════════════════════════════════════════════════
    // 返回结果
    // ═══════════════════════════════════════════════════════════
    
    return res.json({
      success: true,
      message: '通知邮件发送成功',
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      customerEmail: draftOrder.email,
      sentAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('发送通知邮件失败:', error);
    return res.status(500).json({
      error: '发送通知邮件失败',
      message: error.message
    });
  }
}
