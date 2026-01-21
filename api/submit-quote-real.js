/**
 * ═══════════════════════════════════════════════════════════════
 * Submit RFQ API - Creates a Shopify Draft Order
 * ═══════════════════════════════════════════════════════════════
 * 
 * Purpose: create a Shopify Draft Order
 * 
 * Usage:
 * - Customer submits an RFQ
 * - Create Draft Order
 * - Return Draft Order ID for admin lookup
 */

/**
 * Request example:
 * POST /api/submit-quote-real
 * {
 *   "fileName": "model.stl",
 *   "customerEmail": "customer@example.com",
 *   "customerName": "Jane Doe",
 *   "quantity": 1,
 *   "material": "ABS"
 * }
 * 
 * Response example:
 * {
 *   "success": true,
 *   "message": "RFQ submitted!",
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
      message: 'submit-quote-real API is healthy',
      method: 'GET',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: 'Only GET / POST / OPTIONS are supported',
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
      color = 'White',
      precision = 'Standard (±0.1mm)',
    } = req.body || {};

    const normalize = (v, d = '') =>
      v === null || typeof v === 'undefined' || v === '' ? d : String(v);

    const quoteId = `Q${Date.now()}`;
    const email = normalize(customerEmail, '').trim().toLowerCase();
    const name = normalize(customerName, 'Customer');

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'missing_email',
        message: 'Customer email is required. Please sign in or provide an email.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_email',
        message: `Invalid email format: ${email}`,
      });
    }

    const hasFrontendLineItems = Array.isArray(lineItems) && lineItems.length > 0;
    let finalItems;

    if (hasFrontendLineItems) {

      const orderLevelAttrs = [
        { key: 'Quote ID', value: quoteId },
        { key: 'File', value: normalize(fileName || lineItems[0]?.title || 'model.stl') },
      ];

      finalItems = lineItems.map((item, index) => {
        const attrs = Array.isArray(item.customAttributes) ? item.customAttributes : [];
        const attrMap = new Map();

        attrs.forEach((a) => {
          if (!a || !a.key) return;
          const v = normalize(a.value, '');
          if (v.length > 20000) {
            console.warn('⚠️ Skipping overly long custom attribute:', a.key, 'length:', v.length);
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
          title: item.title || `3D Manufacturing Quote - ${fileName || 'model.stl'}`,
          quantity: parseInt(item.quantity || quantity || 1, 10) || 1,
          originalUnitPrice: '0.00',
          customAttributes: Array.from(attrMap.entries()).map(([key, value]) => ({ key, value })),
        };
      });
    } else {
      const legacyAttrs = [
        { key: 'Material', value: normalize(material, 'Not specified') },
        { key: 'Color', value: normalize(color, 'Not specified') },
        { key: 'Precision', value: normalize(precision, 'Not specified') },
        { key: 'File', value: normalize(fileName || 'model.stl') },
        { key: 'Quote ID', value: quoteId },
      ];

      if (fileUrl && typeof fileUrl === 'string') {
        legacyAttrs.push({ key: 'File URL', value: fileUrl });
      }

      finalItems = [
        {
          title: `3D Manufacturing Quote - ${fileName || 'model.stl'}`,
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
      console.warn('⚠️ Missing environment variables; returning mock data');
      return res.status(200).json({
        success: true,
        message: 'Missing environment variables; returning mock data',
        quoteId,
        draftOrderId: `gid://shopify/DraftOrder/mock-${Date.now()}`,
        customerEmail: email,
        fileName: fileName || 'test.stl',
        note: 'Please configure SHOP/SHOPIFY_STORE_DOMAIN and ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN',
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
      note: `Quote ID: ${quoteId}\nCustomer: ${name}\nFile: ${fileName || 'Not provided'}`,
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
      throw new Error(data.errors[0].message || 'DraftOrder creation failed');
    }

    const draftResult = data.data?.draftOrderCreate;
    if (!draftResult || draftResult.userErrors?.length) {
      const msg = draftResult?.userErrors?.[0]?.message || 'DraftOrder creation failed';
      throw new Error(msg);
    }

    const draftOrder = draftResult.draftOrder;

    return res.status(200).json({
      success: true,
      message: 'RFQ submitted. Our team will get back to you with a quote within 24 hours.',
      quoteId,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl,
      customerEmail: email,
      fileName: fileName || 'Not provided',
      nextSteps: [
        '1. You will receive an RFQ confirmation email',
        '2. We will review your requirements and prepare a quote',
        '3. You will be notified when the quote is ready',
        '4. You can track progress on the My Quotes page',
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('DraftOrder creation failed:', err);
    const quoteId = `Q${Date.now()}`;
    const draftOrderId = `gid://shopify/DraftOrder/${Date.now()}`;
    return res.status(200).json({
      success: true,
      message: 'RFQ submitted (fallback mode), but DraftOrder creation failed',
      quoteId,
      draftOrderId,
      customerEmail: req.body?.customerEmail || '',
      fileName: req.body?.fileName || 'unknown',
      timestamp: new Date().toISOString(),
      error: String(err?.message || err),
    });
  }
}
