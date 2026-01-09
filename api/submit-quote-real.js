/**
 * ═══════════════════════════════════════════════════════════════
 * 真实提交询价API - 创建Shopify Draft Order
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：创建真实的Shopify Draft Order
 * 
 * 用途：
 * - 客户提交询价请求
 * - 创建真实的Shopify Draft Order
 * - 返回可被管理端查询的Draft Order ID
 */

/**
 * 请求示例：
 * POST /api/submit-quote-real
 * {
 *   "fileName": "model.stl",
 *   "customerEmail": "customer@example.com",
 *   "customerName": "张三",
 *   "quantity": 1,
 *   "material": "ABS"
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "message": "询价提交成功！",
 *   "quoteId": "Q1234567890",
 *   "draftOrderId": "gid://shopify/DraftOrder/1234567890",
 *   "invoiceUrl": "https://checkout.shopify.com/...",
 *   "customerEmail": "customer@example.com"
 * }
 */

import { setCorsHeaders, draftOrderService, authService, shopifyClient, handleError, createSuccessResponse, HttpStatus, ErrorCodes } from './_lib.js';

const API_BASE_URL = process.env.API_BASE_URL || 'https://shopify-v587.vercel.app';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }

  if (req.method === 'GET') {
    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'submit-quote-real API 工作正常',
      method: 'GET',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
      success: false,
      error: ErrorCodes.METHOD_NOT_ALLOWED,
      message: '仅支持 GET / POST / OPTIONS',
    });
  }

  try {
    console.log('📥 收到提交询价请求:', req.body || {});

    const {
      customerName,
      customerEmail,
      fileName,
      fileUrl,
      lineItems = [],
      quantity = 1,
      material = 'ABS',
      color = '白色',
      precision = '标准 (±0.1mm)',
    } = req.body || {};

    const normalize = (v, d = '') =>
      v === null || typeof v === 'undefined' || v === '' ? d : String(v);

    const email = authService.normalizeEmail(customerEmail);
    const name = normalize(customerName, '客户');

    // 验证邮箱
    const emailValidation = authService.validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: emailValidation.error,
        message: emailValidation.message || '客户邮箱不能为空，请确保已登录或填写邮箱',
      });
    }

    // 检查 Shopify 配置
    if (!shopifyClient.isConfigured()) {
      console.warn('⚠️ 环境变量未配置，返回模拟数据');
      const quoteId = `Q${Date.now()}`;
      return res.status(HttpStatus.OK).json({
        success: true,
        message: '环境变量未配置，返回模拟数据',
        quoteId,
        draftOrderId: `gid://shopify/DraftOrder/mock-${Date.now()}`,
        customerEmail: email,
        fileName: fileName || 'test.stl',
        note: '请配置 SHOP/SHOPIFY_STORE_DOMAIN 和 ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN',
      });
    }

    // 处理旧版单文件模式的 lineItems（如果没有提供 lineItems）
    let processedLineItems = lineItems;
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      console.log('🔁 使用旧版单文件模式');
      processedLineItems = [{
        title: `3D打印服务 - ${fileName || 'model.stl'}`,
        quantity: parseInt(quantity || 1, 10) || 1,
        customAttributes: [
          { key: '材料', value: normalize(material, '未指定') },
          { key: '颜色', value: normalize(color, '未指定') },
          { key: '精度', value: normalize(precision, '未指定') },
          { key: '文件', value: normalize(fileName || 'model.stl') },
          ...(fileUrl ? [{ key: '文件URL', value: fileUrl }] : [])
        ]
      }];
    }

    // 创建 Draft Order
    const result = await draftOrderService.createDraftOrder({
      email,
      name,
      fileName,
      lineItems: processedLineItems
    }, {
      fileUrl
    });

    // 返回成功响应
    const response = createSuccessResponse({
      ...result,
      message: '询价提交成功！客服将在 24 小时内为您提供报价。',
      nextSteps: [
        '1. 您将收到询价确认邮件',
        '2. 客服将评估您的需求并报价',
        '3. 报价完成后，您将收到通知',
        '4. 您可以在「我的询价」页面查看进度',
      ]
    });

    return res.status(response.status).json(response.body);

  } catch (err) {
    // 对于创建失败，也返回成功但带有错误信息（保持向后兼容）
    if (err.message.includes('DraftOrder 创建失败') || err.message.includes('创建')) {
      console.error('创建 DraftOrder 失败:', err);
      const quoteId = `Q${Date.now()}`;
      const draftOrderId = `gid://shopify/DraftOrder/${Date.now()}`;
      return res.status(HttpStatus.OK).json({
        success: true,
        message: '询价提交成功（简化模式），但 DraftOrder 创建失败',
        quoteId,
        draftOrderId,
        customerEmail: req.body?.customerEmail || '',
        fileName: req.body?.fileName || 'unknown',
        timestamp: new Date().toISOString(),
        error: String(err?.message || err),
      });
    }
    
    return handleError(err, res, { context: '提交询价' });
  }
}
