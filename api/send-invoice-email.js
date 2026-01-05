import { setCorsHeaders } from './cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 发送发票邮件 API - 调用Shopify内置的发送发票功能
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：通过Shopify Admin API发送草稿订单发票邮件给客户
 * 
 * 流程：
 * 1. 验证草稿订单ID
 * 2. 调用Shopify的draftOrderInvoiceSend mutation
 * 3. 发送包含结账链接的邮件给客户
 * 
 * 请求示例：
 * POST /api/send-invoice-email
 * {
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789",
 *   "customMessage": "您的3D打印报价已完成，请点击链接查看详情并付款。"
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "message": "发票邮件发送成功",
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

  const { draftOrderId, customMessage } = req.body;

  // 验证必填字段
  if (!draftOrderId) {
    return res.status(400).json({
      error: '缺少必填字段',
      required: ['draftOrderId']
    });
  }

  try {
    console.log('开始发送发票邮件:', { draftOrderId, customMessage });

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

    console.log('草稿订单信息:', {
      name: draftOrder.name,
      email: draftOrder.email,
      totalPrice: draftOrder.totalPrice
    });

    // ═══════════════════════════════════════════════════════════
    // 步骤 2: 发送发票邮件
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
    
    console.log('发票邮件发送成功');
    
    // ═══════════════════════════════════════════════════════════
    // 返回结果
    // ═══════════════════════════════════════════════════════════
    
    return res.json({
      success: true,
      message: '发票邮件发送成功',
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      customerEmail: draftOrder.email,
      totalPrice: draftOrder.totalPrice,
      invoiceUrl: draftOrder.invoiceUrl,
      sentAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('发送发票邮件失败:', error);
    return res.status(500).json({
      error: '发送发票邮件失败',
      message: error.message
    });
  }
}
