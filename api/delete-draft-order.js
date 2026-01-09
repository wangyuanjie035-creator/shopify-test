/**
 * ═══════════════════════════════════════════════════════════════
 * 删除 Draft Order API - 管理端删除询价单
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：删除指定的Shopify Draft Order
 * 
 * 用途：
 * - 管理端删除不需要的询价单
 * - 清理测试数据
 * - 管理订单生命周期
 * 
 * 请求示例：
 * DELETE /api/delete-draft-order
 * {
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789",
 *   "email": "user@example.com",
 *   "admin": "true"
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "message": "Draft Order删除成功",
 *   "deletedId": "gid://shopify/DraftOrder/123456789"
 * }
 */

import { setCorsHeaders, draftOrderService, authService, shopifyClient, handleError, createSuccessResponse, HttpStatus } from './_lib.js';

export default async function handler(req, res) {
  // 设置CORS头
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }

  // 只接受POST/DELETE请求
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({ 
      error: 'Method not allowed' 
    });
  }

  try {
    const { draftOrderId, email, admin } = req.body || {};

    // 验证必填参数
    if (!draftOrderId) {
      return res.status(HttpStatus.BAD_REQUEST).json({ 
        success: false, 
        error: 'Missing draftOrderId parameter',
        message: '缺少询价单ID参数'
      });
    }

    console.log('开始删除Draft Order:', draftOrderId);

    // 检查 Shopify 配置
    if (!shopifyClient.isConfigured()) {
      console.log('环境变量未配置，返回模拟删除结果');
      return res.status(HttpStatus.OK).json({
        success: true,
        message: '环境变量未配置，模拟删除成功',
        deletedId: draftOrderId,
        note: '请配置SHOP/SHOPIFY_STORE_DOMAIN和ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN环境变量'
      });
    }

    // 提取认证信息
    const { email: requesterEmail, isAdmin: isAdminRequest } = authService.extractAuthFromRequest(req);

    // 执行删除
    const deletedId = await draftOrderService.deleteDraftOrder(draftOrderId, {
      requesterEmail,
      isAdmin: isAdminRequest
    });

    // 返回成功响应
    const response = createSuccessResponse({
      deletedId,
      message: 'Draft Order删除成功'
    });

    return res.status(response.status).json(response.body);

  } catch (error) {
    return handleError(error, res, { context: '删除Draft Order' });
  }
}
