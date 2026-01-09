import { setCorsHeaders, HttpStatus } from './_lib.js';

export default async function handler(req, res) {
  // 设置CORS头
  setCorsHeaders(req, res);

  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { draftOrderId } = req.body || {};
    
    if (!draftOrderId) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Draft Order ID is required'
      });
    }

    const shop = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const adminToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

    if (!shop || !adminToken) {
      throw new Error('Missing environment variables: SHOPIFY_STORE_DOMAIN/SHOP or SHOPIFY_ACCESS_TOKEN/ADMIN_TOKEN');
    }

    const shopifyDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const graphqlEndpoint = `https://${shopifyDomain}/admin/api/2024-01/graphql.json`;

    console.log('🔄 开始完成草稿订单:', draftOrderId);

    // 完成草稿订单
    const completeDraftOrderMutation = `
      mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
        draftOrderComplete(id: $id, paymentPending: $paymentPending) {
          draftOrder {
            id
            name
            email
            totalPrice
            status
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const completeResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: completeDraftOrderMutation,
        variables: { 
          id: draftOrderId,
          paymentPending: true // 设置为待付款状态
        }
      })
    });

    const completeResult = await completeResponse.json();
    console.log('📋 完成草稿订单结果:', completeResult);

    const userErrors = completeResult.data?.draftOrderComplete?.userErrors || [];
    const completedDraftOrder = completeResult.data?.draftOrderComplete?.draftOrder;

    // 如果订单已支付，返回成功并附带信息，避免前端阻塞
    const paidError = userErrors.find(e => e.message?.includes('has been paid'));
    if (paidError) {
      return res.status(HttpStatus.OK).json({
        success: true,
        message: '订单已支付或已完成，无需重复支付',
        draftOrder: completedDraftOrder || null
      });
    }

    if (userErrors.length > 0) {
      throw new Error(`完成草稿订单失败: ${userErrors.map(e => e.message).join(', ')}`);
    }

    if (!completedDraftOrder) {
      throw new Error(`完成草稿订单失败: 响应为空或无draftOrder`);
    }

    return res.status(HttpStatus.OK).json({
      success: true,
      draftOrder: {
        id: completedDraftOrder.id,
        name: completedDraftOrder.name,
        email: completedDraftOrder.email,
        totalPrice: completedDraftOrder.totalPrice,
        status: completedDraftOrder.status,
        invoiceUrl: completedDraftOrder.invoiceUrl
      },
      message: '草稿订单已完成，可以付款'
    });

  } catch (error) {
    console.error('❌ 完成草稿订单失败:', error);
    
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: error.message,
      message: '完成草稿订单失败'
    });
  }
}
