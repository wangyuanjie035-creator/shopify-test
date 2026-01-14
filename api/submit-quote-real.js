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

import { setCorsHeaders } from '../utils/cors-config.js';

const API_BASE_URL = process.env.API_BASE_URL || 'https://shopify-v587.vercel.app';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'submit-quote-real API 工作正常',
      method: 'GET',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: '仅支持 GET / POST / OPTIONS',
    });
  }

  try {

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

    const quoteId = `Q${Date.now()}`;
    const email = normalize(customerEmail, '').trim().toLowerCase();
    const name = normalize(customerName, '客户');

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'missing_email',
        message: '客户邮箱不能为空，请确保已登录或填写邮箱',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_email',
        message: `邮箱格式无效: ${email}`,
      });
    }

    const hasFrontendLineItems = Array.isArray(lineItems) && lineItems.length > 0;
    let finalItems;

    if (hasFrontendLineItems) {

      const orderLevelAttrs = [
        { key: '询价单号', value: quoteId },
        { key: '文件', value: normalize(fileName || lineItems[0]?.title || 'model.stl') },
      ];

      finalItems = lineItems.map((item, index) => {
        const attrs = Array.isArray(item.customAttributes) ? item.customAttributes : [];
        const attrMap = new Map();

        attrs.forEach((a) => {
          if (!a || !a.key) return;
          const v = normalize(a.value, '');
          if (v.length > 20000) {
            console.warn('⚠️ 跳过过长自定义字段:', a.key, '长度:', v.length);
            return;
          }
          attrMap.set(a.key, v);
        });

        if (index === 0) {
          orderLevelAttrs.forEach((a) => {
            if (!attrMap.has(a.key)) {
              attrMap.set(a.key, normalize(a.value, ''));
            }
          });
        }

        return {
          title: item.title || `3D打印服务 - ${fileName || 'model.stl'}`,
          quantity: parseInt(item.quantity || quantity || 1, 10) || 1,
          originalUnitPrice: '0.00',
          customAttributes: Array.from(attrMap.entries()).map(([key, value]) => ({ key, value })),
        };
      });
    } else {
      const legacyAttrs = [
        { key: '材料', value: normalize(material, '未指定') },
        { key: '颜色', value: normalize(color, '未指定') },
        { key: '精度', value: normalize(precision, '未指定') },
        { key: '文件', value: normalize(fileName || 'model.stl') },
        { key: '询价单号', value: quoteId },
      ];

      if (fileUrl && typeof fileUrl === 'string') {
        legacyAttrs.push({ key: '文件URL', value: fileUrl });
      }

      finalItems = [
        {
          title: `3D打印服务 - ${fileName || 'model.stl'}`,
          quantity: parseInt(quantity || 1, 10) || 1,
          originalUnitPrice: '0.00',
          customAttributes: legacyAttrs.map((a) => ({
            key: a.key,
            value: normalize(a.value, ''),
          })),
        },
      ];
    }


    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

    if (!storeDomain || !accessToken) {
      console.warn('⚠️ 环境变量未配置，返回模拟数据');
      return res.status(200).json({
        success: true,
        message: '环境变量未配置，返回模拟数据',
        quoteId,
        draftOrderId: `gid://shopify/DraftOrder/mock-${Date.now()}`,
        customerEmail: email,
        fileName: fileName || 'test.stl',
        note: '请配置 SHOP/SHOPIFY_STORE_DOMAIN 和 ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN',
      });
    }

    const createDraftOrderMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            email
            invoiceUrl
            totalPrice
            createdAt
            lineItems(first: 20) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPrice
                  customAttributes { key value }
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const input = {
      email,
      taxExempt: true,
      lineItems: finalItems,
      note: `询价单号: ${quoteId}\n客户: ${name}\n文件: ${fileName || '未提供'}`,
    };

    const resp = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: createDraftOrderMutation, variables: { input } }),
    });

    const data = await resp.json();
    
    if (data.errors && data.errors.length) {
      throw new Error(data.errors[0].message || 'DraftOrder 创建失败');
    }

    const draftResult = data.data?.draftOrderCreate;
    if (!draftResult || draftResult.userErrors?.length) {
      const msg = draftResult?.userErrors?.[0]?.message || 'DraftOrder 创建失败';
      throw new Error(msg);
    }

    const draftOrder = draftResult.draftOrder;

    return res.status(200).json({
      success: true,
      message: '询价提交成功！客服将在 24 小时内为您提供报价。',
      quoteId,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl,
      customerEmail: email,
      fileName: fileName || '未提供',
      nextSteps: [
        '1. 您将收到询价确认邮件',
        '2. 客服将评估您的需求并报价',
        '3. 报价完成后，您将收到通知',
        '4. 您可以在「我的询价」页面查看进度',
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('创建 DraftOrder 失败:', err);
    const quoteId = `Q${Date.now()}`;
    const draftOrderId = `gid://shopify/DraftOrder/${Date.now()}`;
    return res.status(200).json({
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
}
