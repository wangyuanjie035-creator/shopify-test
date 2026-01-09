import { setCorsHeaders, shopifyClient, draftOrderService, handleError, createSuccessResponse, HttpStatus, ErrorCodes } from './_lib.js';

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }

  if (req.method !== 'POST') {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({ error: 'Method not allowed' });
  }

  const { draftOrderId, customMessage } = req.body;

  // 验证必填字段
  if (!draftOrderId) {
    return res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      error: ErrorCodes.MISSING_PARAMETER,
      message: '缺少必填字段',
      required: ['draftOrderId']
    });
  }

  try {
    console.log('开始发送发票邮件:', { draftOrderId, customMessage });

    // ═══════════════════════════════════════════════════════════
    // 步骤 1: 查询草稿订单信息
    // ═══════════════════════════════════════════════════════════
    
    const draftOrder = await draftOrderService.getDraftOrder(draftOrderId, { isAdmin: true });
    
    if (!draftOrder) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: ErrorCodes.NOT_FOUND,
        message: '未找到草稿订单'
      });
    }
    
    if (!draftOrder.email) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: ErrorCodes.VALIDATION_ERROR,
        message: '草稿订单没有客户邮箱地址'
      });
    }

    console.log('草稿订单信息:', {
      name: draftOrder.name,
      email: draftOrder.email,
      totalPrice: draftOrder.totalPrice
    });

    // ═══════════════════════════════════════════════════════════
    // 步骤 2: 发送发票邮件
    // ═══════════════════════════════════════════════════════════
    
    const result = await shopifyClient.sendInvoiceEmail(draftOrderId);
    
    if (!result) {
      throw new Error('发送发票邮件失败');
    }
    
    console.log('发票邮件发送成功');
    
    // ═══════════════════════════════════════════════════════════
    // 返回结果
    // ═══════════════════════════════════════════════════════════
    
    const response = createSuccessResponse({
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      customerEmail: draftOrder.email,
      totalPrice: draftOrder.totalPrice,
      invoiceUrl: draftOrder.invoiceUrl || result.invoiceUrl,
      sentAt: new Date().toISOString(),
      message: '发票邮件发送成功'
    });

    return res.status(response.status).json(response.body);
    
  } catch (error) {
    return handleError(error, res, { context: '发送发票邮件' });
  }
}
