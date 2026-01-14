import { setCorsHeaders } from '../utils/cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 发送邮件 API - 调用Shopify内置的发送发票功能
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：通过Shopify Admin API发送草稿订单邮件给客户
 * 支持两种类型：
 * 1. 发票邮件（正常报价）- 包含结账链接
 * 2. 无法加工通知邮件 - 包含原因和建议
 * 
 * 请求示例（发票邮件）：
 * POST /api/send-invoice-email
 * {
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789",
 *   "customMessage": "您的3D打印报价已完成，请点击链接查看详情并付款。"
 * }
 * 
 * 请求示例（无法加工通知）：
 * POST /api/send-invoice-email
 * {
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789",
 *   "emailType": "unprocessable",
 *   "reason": "零件尺寸超出加工范围",
 *   "suggestion": "请将尺寸调整为XX以内",
 *   "orderName": "#D1001"
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "message": "邮件发送成功",
 *   "invoiceUrl": "https://checkout.shopify.com/..."
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

  const { draftOrderId, customMessage, emailType, reason, suggestion, orderName } = req.body;

  // 验证必填字段
  if (!draftOrderId) {
    return res.status(400).json({
      error: '缺少必填字段',
      required: ['draftOrderId']
    });
  }

  // 判断邮件类型：unprocessable = 无法加工通知，其他 = 发票邮件
  const isUnprocessableEmail = emailType === 'unprocessable';

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
    // 步骤 2: 如果是"无法加工"通知，先更新订单备注
    // ═══════════════════════════════════════════════════════════
    
    if (isUnprocessableEmail) {
      const emailNote = `无法加工通知

订单号：${orderName || draftOrder.name}

很抱歉通知您，您的询价订单暂时无法加工。

无法加工的原因：
${reason || '未提供原因'}

修改建议：
${suggestion || '未提供建议'}

请您根据以上建议调整后重新提交询价，如有疑问欢迎直接回复此邮件与我们联系。

感谢您的理解与配合！`;

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
    }

    // ═══════════════════════════════════════════════════════════
    // 步骤 3: 发送邮件
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
      throw new Error('发送发票邮件失败: ' + sendInvoiceResult.data.draftOrderInvoiceSend.userErrors[0].message);
    }
    
    // ═══════════════════════════════════════════════════════════
    // 返回结果
    // ═══════════════════════════════════════════════════════════
    
    return res.json({
      success: true,
      message: isUnprocessableEmail ? '通知邮件发送成功' : '发票邮件发送成功',
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      customerEmail: draftOrder.email,
      totalPrice: draftOrder.totalPrice,
      invoiceUrl: draftOrder.invoiceUrl,
      emailType: isUnprocessableEmail ? 'unprocessable' : 'invoice',
      sentAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('发送邮件失败:', error);
    return res.status(500).json({
      error: isUnprocessableEmail ? '发送通知邮件失败' : '发送发票邮件失败',
      message: error.message
    });
  }
}
