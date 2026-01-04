// api/submit-quote-real.js
import { setCorsHeaders } from './cors-config.js';

const API_BASE_URL = process.env.API_BASE_URL || 'https://shopify-v587.vercel.app';

/**
 * ═══════════════════════════════════════════════════════════════
 * 多文件询价提交API - 创建Shopify Draft Order
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：支持多个文件上传的询价提交
 * 
 * 请求示例：
 * POST /api/submit-quote-real
 * {
 *   "files": [
 *     {
 *       "fileUrl": "data:application/step;base64,U1RFUCBGSUxF...",
 *       "fileName": "model1.STEP",
 *       "fileType": "application/step"
 *     },
 *     {
 *       "fileUrl": "data:application/pdf;base64,JVBERi0xLjQK...",
 *       "fileName": "specification.pdf",
 *       "fileType": "application/pdf"
 *     }
 *   ],
 *   "customerEmail": "customer@example.com",
 *   "customerName": "张三",
 *   "quantity": 1,
 *   "material": "ABS"
 * }
 */

export default async function handler(req, res) {
  console.log('========================================');
  console.log('收到创建草稿订单请求:', { method: req.method, url: req.url });
  
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] });
  }

  try {
    const { customerId, lineItems, note, tags } = req.body;

    if (!customerId || !lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: customerId 和 lineItems 不能为空。'
      });
    }

    console.log('📊 创建草稿订单参数:', { customerId, itemCount: lineItems.length, note, tags });

    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

    if (!storeDomain || !accessToken) {
      return res.status(500).json({ success: false, message: '环境变量未配置: SHOPIFY_STORE_DOMAIN 和 SHOPIFY_ACCESS_TOKEN。' });
    }

    // 准备 Draft Order 输入
    const input = {
      customerId: customerId,
      note: note || '',
      tags: tags || [],
      lineItems: lineItems.map(item => ({
        title: item.title,
        quantity: item.quantity,
        originalUnitPrice: "0.00", // 价格待定
        properties: item.properties || []
      }))
    };

    const createDraftOrderMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
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

    const response = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query: createDraftOrderMutation,
        variables: { input }
      })
    });

    const data = await response.json();

    if (data.errors || data.data.draftOrderCreate.userErrors.length > 0) {
      const errors = data.errors || data.data.draftOrderCreate.userErrors;
      console.error('❌ 创建草稿订单失败:', errors);
      throw new Error(`创建草稿订单失败: ${errors[0].message}`);
    }

    const draftOrder = data.data.draftOrderCreate.draftOrder;
    console.log('✅ 草稿订单创建成功:', { id: draftOrder.id, name: draftOrder.name });

    return res.status(200).json({
      success: true,
      message: '询价提交成功！',
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl
    });

  } catch (error) {
    console.error('❌ 处理创建草稿订单请求时出错:', error);
    return res.status(500).json({
      success: false,
      message: '创建草稿订单时发生内部错误。',
      error: error.message
    });
  }
}
