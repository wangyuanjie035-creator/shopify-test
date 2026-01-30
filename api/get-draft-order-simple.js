/**
 * Lightweight Draft Order fetch API (reduced permissions surface)
 */

// Helper: call Shopify GraphQL API
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
  
  if (!storeDomain || !accessToken) {
    throw new Error('Missing Shopify configuration');
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

  const json = await resp.json();
  
  if (!resp.ok) {
    throw new Error(`Shopify API request failed: ${resp.status}`);
  }
  
  if (json.errors) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  
  return json;
}

// Helper: get draft order note using REST API
async function getDraftOrderNote(draftOrderId) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
  
  if (!storeDomain || !accessToken) {
    return '';
  }
  
  // Extract numeric ID from GID (e.g., "gid://shopify/DraftOrder/123456" -> "123456")
  const numericId = draftOrderId.replace(/\D/g, '');
  if (!numericId) {
    return '';
  }
  
  try {
    const restEndpoint = `https://${storeDomain}/admin/api/2024-01/draft_orders/${numericId}.json`;
    const resp = await fetch(restEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
    });
    
    if (resp.ok) {
      const data = await resp.json();
      return data.draft_order?.note || '';
    }
  } catch (error) {
    console.warn('Failed to fetch note from REST API:', error.message);
  }
  
  return '';
}

import { handleCors, getAdminEmails } from './cors-config.js';

export default async function handler(req, res) {
  // 统一处理 CORS：设置头、处理 OPTIONS、验证方法
  if (handleCors(req, res, 'GET')) return;
  
  const { id, email, admin } = req.query;
  const customerEmail = (email || '').trim().toLowerCase();

  // Admin allowlist - 使用统一配置
  const adminWhitelist = getAdminEmails();
  const isAdminRequest = ['1', 'true', 'yes'].includes((admin || '').toString().toLowerCase()) &&
    adminWhitelist.includes(customerEmail);
  
  if (!customerEmail) {
    return res.status(401).json({
      error: 'missing_email',
      message: 'Please provide the email parameter to verify identity.'
    });
  }
  if (admin && !isAdminRequest) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'You are not allowed to view other users’ quotes.'
    });
  }
  
  if (!id) {
    return res.status(400).json({
      error: 'missing_id',
      message: 'Please provide the quote id.'
    });
  }

  try {
    let draftOrder = null;
    
    // If id is a GID, query directly
    if (id.startsWith('gid://shopify/DraftOrder/')) {
      const query = `
        query($id: ID!) {
          draftOrder(id: $id) {
            id
            name
            email
            totalPrice
            status
            createdAt
            invoiceUrl
            lineItems(first: 10) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPrice
                  customAttributes {
                    key
                    value
                  }
                }
              }
            }
          }
        }
      `;
      
      const result = await shopGql(query, { id });
      draftOrder = result.data.draftOrder;

      // Email check: ensure the order belongs to the current customer (except admins)
      if (!isAdminRequest && draftOrder && (draftOrder.email || '').toLowerCase() !== customerEmail) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'This quote does not belong to the current account.'
        });
      }
      
      // Fetch note using REST API if GraphQL doesn't provide it
      if (draftOrder && !draftOrder.note) {
        draftOrder.note = await getDraftOrderNote(draftOrder.id);
      }
    } else {
      // If id is a name, search first then query
      const searchQuery = `
        query($query: String!) {
          draftOrders(first: 10, query: $query) {
            edges {
              node {
                id
                name
                email
                totalPrice
                status
                createdAt
                lineItems(first: 5) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      originalUnitPrice
                      customAttributes {
                        key
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const searchTerm = id.startsWith('#') ? `name:${id}` : `name:#${id}`;
      // Admin can search any; customers are restricted by email
      const searchQueryStr = isAdminRequest
        ? searchTerm
        : `${searchTerm} AND email:"${customerEmail}"`;

      const result = await shopGql(searchQuery, { query: searchQueryStr });
      
      if (result.data.draftOrders.edges.length > 0) {
        draftOrder = result.data.draftOrders.edges[0].node;
        // Fetch note using REST API if GraphQL doesn't provide it
        if (draftOrder && !draftOrder.note) {
          draftOrder.note = await getDraftOrderNote(draftOrder.id);
        }
      }
    }
    
    if (!draftOrder) {
      return res.status(404).json({
        error: 'not_found',
        message: `Quote ${id} not found`
      });
    }
    
    // Normalize lineItems
    const lineItems = draftOrder.lineItems.edges.map(edge => edge.node);
    const firstLineItem = lineItems[0] || {};
    const customAttributes = firstLineItem.customAttributes || [];
    
    // Extract from customAttributes
    const getAttribute = (key) => {
      const attr = customAttributes.find(a => a.key === key);
      return attr ? attr.value : '';
    };
    
    // Shape response for frontend compatibility
    return res.status(200).json({
      success: true,
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        email: draftOrder.email,
        status: draftOrder.status === 'INVOICE_SENT' ? 'Quoted' : 'Pending',
        totalPrice: draftOrder.totalPrice,
        createdAt: draftOrder.createdAt,
        invoiceUrl: draftOrder.invoiceUrl || 'data:stored',
        note: draftOrder.note || '',
        
        // Keep the lineItems array shape for the frontend
        lineItems: lineItems.map(item => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          originalUnitPrice: item.originalUnitPrice,
          price: item.originalUnitPrice, // compatibility field
          customAttributes: item.customAttributes
        })),
        
        // File info (legacy)
        file: {
          name: getAttribute('File') || firstLineItem.title || 'Unknown file'
        },
        
        // Product info (legacy)
        product: {
          title: firstLineItem.title || '3D Manufacturing Quote',
          quantity: firstLineItem.quantity || 1
        },
        
        // Customization (legacy)
        customization: {
          quantity: firstLineItem.quantity || 1,
          material: getAttribute('Material') || 'Not specified',
          color: getAttribute('Color') || 'Not specified',
          precision: getAttribute('Precision') || 'Not specified'
        },
        
        // Quote info (legacy)
        quote: {
          amount: draftOrder.totalPrice || '0.00',
          note: '',
          quotedAt: ''
        },
        
        // Invoice URL
        invoiceUrl: draftOrder.invoiceUrl || 'data:stored',
        
        // File ID
        fileId: getAttribute('File ID') || null,
        
        // Full lineItems
        lineItems: lineItems
      }
    });
    
  } catch (error) {
    console.error('Failed to fetch Draft Order:', error);
    return res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
}
