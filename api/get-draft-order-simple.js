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

export default async function handler(req, res) {
  // 设置CORS头 - 允许指定的Shopify域名列表
  const allowedOrigins = [
    'https://sain-pdc-test.myshopify.com',
    'https://happy-july.myshopify.com',
    // 可以在这里添加更多允许的域名
  ];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { id, email, admin } = req.query;
  const customerEmail = (email || '').trim().toLowerCase();

// Admin allowlist
const adminWhitelist = (process.env.ADMIN_EMAIL_WHITELIST || 'jonathan.wang@sainstore.com,issac.yu@sainstore.com,kitto.chen@sainstore.com,cherry@sain3.com, keihen.luo@sain3.com,nancy.lin@sainstore.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
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
            note
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
                note
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
