/**
 * 简化版获取 Draft Order API - 避免权限问题
 */

import { setCorsHeaders, draftOrderService, authService, shopifyClient, handleError, createSuccessResponse, HttpStatus, ErrorCodes } from './_lib.js';

export default async function handler(req, res) {
  // 设置 CORS 头
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({ error: 'Method not allowed' });
  }
  
  const { id } = req.query;
  
  // 验证必填参数
  if (!id) {
    return res.status(HttpStatus.BAD_REQUEST).json({
      error: ErrorCodes.MISSING_PARAMETER,
      message: '请提供询价单ID'
    });
  }

  try {
    console.log('查找询价单:', id);
    
    // 提取认证信息
    const { email: requesterEmail, isAdmin: isAdminRequest } = authService.extractAuthFromRequest(req);
    
    // 验证邮箱
    const emailValidation = authService.validateEmail(requesterEmail);
    if (!emailValidation.valid) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: emailValidation.error,
        message: emailValidation.message
      });
    }
    
    // 验证管理员权限
    if (req.query.admin && !isAdminRequest) {
      return res.status(HttpStatus.FORBIDDEN).json({
        error: ErrorCodes.FORBIDDEN,
        message: '您无权查看其他用户的询价单'
      });
    }
    
    let draftOrder = null;
    
    // 如果是GID格式，直接查询
    if (id.startsWith('gid://shopify/DraftOrder/')) {
      draftOrder = await draftOrderService.getDraftOrder(id, {
        requesterEmail,
        isAdmin: isAdminRequest
      });
    } else {
      // 如果是名称格式，先搜索再查询
      const searchTerm = id.startsWith('#') ? `name:${id}` : `name:#${id}`;
      const searchQuery = isAdminRequest
        ? searchTerm
        : `${searchTerm} AND email:"${requesterEmail}"`;
      
      const draftOrders = await shopifyClient.getDraftOrders({
        first: 10,
        search: searchQuery
      });
      
      if (draftOrders.length > 0) {
        const rawOrder = draftOrders[0];
        draftOrder = await draftOrderService.getDraftOrder(rawOrder.id, {
          requesterEmail,
          isAdmin: isAdminRequest
        });
      }
    }
    
    if (!draftOrder) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: ErrorCodes.NOT_FOUND,
        message: `询价单 ${id} 不存在`
      });
    }
    
    // draftOrderService 已经格式化数据，但我们需要为前端添加向后兼容的字段
    const firstLineItem = draftOrder.lineItems?.[0] || {};
    const customAttributes = firstLineItem.customAttributes || [];
    
    // 从 customAttributes 中提取信息
    const getAttribute = (key) => {
      const attr = customAttributes.find(a => a.key === key);
      return attr ? attr.value : '';
    };
    
    // 构建与前端期望匹配的数据结构
    const response = createSuccessResponse({
      draftOrder: {
        ...draftOrder,
        status: draftOrder.status === 'quoted' ? '已报价' : '待报价',
        
        // 保持 lineItems 数组结构，供前端使用
        lineItems: draftOrder.lineItems.map(item => ({
          ...item,
          price: item.originalUnitPrice // 兼容性字段
        })),
        
        // 文件信息（向后兼容）
        file: {
          name: getAttribute('文件') || firstLineItem.title || '未知文件'
        },
        
        // 产品信息（向后兼容）
        product: {
          title: firstLineItem.title || '3D打印服务',
          quantity: firstLineItem.quantity || 1
        },
        
        // 定制信息（向后兼容）
        customization: {
          quantity: firstLineItem.quantity || 1,
          material: getAttribute('材料') || '未指定',
          color: getAttribute('颜色') || '未指定',
          precision: getAttribute('精度') || '未指定'
        },
        
        // 报价信息（向后兼容）
        quote: {
          amount: draftOrder.totalPrice || '0.00',
          note: '',
          quotedAt: ''
        }
      }
    });

    return res.status(response.status).json(response.body);
    
  } catch (error) {
    return handleError(error, res, { context: '获取 Draft Order' });
  }
}
