/**
 * 简化版获取 Draft Order API - 避免权限问题
 */

// 辅助函数：调用 Shopify GraphQL API
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
  
  if (!storeDomain || !accessToken) {
    throw new Error('缺少 Shopify 配置');
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
    throw new Error(`Shopify API 请求失败: ${resp.status}`);
  }
  
  if (json.errors) {
    throw new Error(`GraphQL 错误: ${json.errors[0].message}`);
  }
  
  return json;
}

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
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

// 管理员白名单
const adminWhitelist = (process.env.ADMIN_EMAIL_WHITELIST || 'jonathan.wang@sainstore.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdminRequest = ['1', 'true', 'yes'].includes((admin || '').toString().toLowerCase()) &&
    adminWhitelist.includes(customerEmail);
  
  if (!customerEmail) {
    return res.status(401).json({
      error: '缺少客户邮箱',
      message: '请提供 email 参数以验证身份'
    });
  }
  if (admin && !isAdminRequest) {
    return res.status(403).json({
      error: 'forbidden',
      message: '您无权查看其他用户的询价单'
    });
  }
  
  if (!id) {
    return res.status(400).json({
      error: '缺少参数',
      message: '请提供询价单ID'
    });
  }

  try {
    console.log('查找询价单:', id);
    
    let draftOrder = null;
    
    // 如果是GID格式，直接查询
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
      `;
      
      const result = await shopGql(query, { id });
      draftOrder = result.data.draftOrder;

      // 邮箱校验：确保订单属于当前客户（管理员除外）
      if (!isAdminRequest && draftOrder && (draftOrder.email || '').toLowerCase() !== customerEmail) {
        return res.status(403).json({
          error: 'forbidden',
          message: '该询价单不属于当前账户'
        });
      }
    } else {
      // 如果是名称格式，先搜索再查询
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
      // 管理员可搜索任意；普通用户需限定邮箱
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
        error: '未找到询价单',
        message: `询价单 ${id} 不存在`
      });
    }
    
    // 处理lineItems数据
    const lineItems = draftOrder.lineItems.edges.map(edge => edge.node);
    const firstLineItem = lineItems[0] || {};
    const customAttributes = firstLineItem.customAttributes || [];
    
    // 从customAttributes中提取信息
    const getAttribute = (key) => {
      const attr = customAttributes.find(a => a.key === key);
      return attr ? attr.value : '';
    };
    
    // 构建与前端期望匹配的数据结构
    return res.status(200).json({
      success: true,
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        email: draftOrder.email,
        status: draftOrder.status === 'INVOICE_SENT' ? '已报价' : '待报价',
        totalPrice: draftOrder.totalPrice,
        createdAt: draftOrder.createdAt,
        
        // 保持lineItems数组结构，供前端使用
        lineItems: lineItems.map(item => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          originalUnitPrice: item.originalUnitPrice,
          price: item.originalUnitPrice, // 兼容性字段
          customAttributes: item.customAttributes
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
        },
        
        // 文件下载URL（用于管理员下载）
        invoiceUrl: draftOrder.invoiceUrl || 'data:stored',
        
        // 文件ID（从customAttributes中获取）
        fileId: getAttribute('文件ID') || null,
        
        // 完整的lineItems（供高级使用）
        lineItems: lineItems
      }
    });
    
  } catch (error) {
    console.error('获取 Draft Order 失败:', error);
    return res.status(500).json({
      error: '获取询价失败',
      message: error.message
    });
  }
}
