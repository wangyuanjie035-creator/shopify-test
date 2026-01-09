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

import { setCorsHeaders, draftOrderService, shopifyClient, handleError, createSuccessResponse, HttpStatus, ErrorCodes } from './_lib.js';

// ─────────────────────────────────────────────────────────────
// 主处理函数
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // 设置 CORS 头
  setCorsHeaders(req, res);
  
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }
  
  // 只接受 POST 请求
  if (req.method !== 'POST') {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({ error: 'Method not allowed' });
  }
  
  const { draftOrderId, amount, note, senderEmail } = req.body;
  
  // 验证必填字段
  if (!draftOrderId || !amount) {
    return res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      error: ErrorCodes.MISSING_PARAMETER,
      message: '缺少必填字段',
      required: ['draftOrderId', 'amount']
    });
  }
  
    try {
    console.log('开始更新报价:', { draftOrderId, amount });
    
    // 使用服务层更新报价
    const result = await draftOrderService.updateQuote(draftOrderId, {
      amount,
      note,
      senderEmail
    });

    // ═══════════════════════════════════════════════════════════
    // 步骤 3: 同步更新 Metaobject 状态（可选，非致命）
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
      
      const metaobjectResult = await shopifyClient.query(findMetaobjectQuery, {
        type: "quote",
        first: 100
      });
      
      // 找到匹配的 Metaobject
      const matchingMetaobject = metaobjectResult.data?.metaobjects?.edges?.find(edge => {
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
        
        await shopifyClient.query(updateMetaobjectMutation, {
          id: metaobjectId,
          metaobject: {
            fields: [
              { key: "status", value: "已报价" },
              { key: "amount", value: amount.toString() },
              { key: "note", value: note || '' },
              { key: "quoted_at", value: new Date().toISOString() }
            ]
          }
        });
        
        console.log('Metaobject 状态同步成功');
      } else {
        console.warn('未找到对应的 Metaobject，跳过同步');
      }
    } catch (metaError) {
      console.warn('Metaobject 同步失败（非致命错误）:', metaError.message);
    }
    
    // ═══════════════════════════════════════════════════════════
    // 返回结果
    // ═══════════════════════════════════════════════════════════
    
    const response = createSuccessResponse({
      ...result,
      message: '报价更新成功'
    });

    return res.status(response.status).json(response.body);
    
  } catch (error) {
    return handleError(error, res, { context: '更新报价' });
  }
}

