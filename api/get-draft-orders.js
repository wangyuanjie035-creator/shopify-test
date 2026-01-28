//get-draft-orders.js
import { handleCors, getAdminEmails } from './cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 获取 Draft Orders 列表 API - 管理端使用
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：获取所有 Draft Orders 列表供管理端显示
 * 
 * 用途：
 * - 管理端显示所有询价单
 * - 支持状态过滤
 * - 提供统计信息
 * 
 * 请求示例：
 * GET /api/get-draft-orders?status=pending
 * GET /api/get-draft-orders?limit=20
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "draftOrders": [
 *     {
 *       "id": "gid://shopify/DraftOrder/1234567890",
 *       "name": "#D1001",
 *       "email": "customer@example.com",
 *       "status": "pending",
 *       "totalPrice": "99.00",
 *       "createdAt": "2025-10-15T08:00:00Z",
 *       "lineItems": [...]
 *     }
 *   ],
 *   "total": 10,
 *   "pending": 5,
 *   "quoted": 5
 * }
 */

export default async function handler(req, res) {
  // 统一处理 CORS：设置头、处理 OPTIONS、验证方法
  if (handleCors(req, res, 'GET')) return;

  try {
    // 检查环境变量 - 支持多种变量名
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
    
    if (!storeDomain || !accessToken) {
      
      // 返回模拟数据
      return res.status(200).json({
        success: true,
        message: 'Missing environment variables; returning mock data',
        draftOrders: [
          {
            id: 'gid://shopify/DraftOrder/1234567890',
            name: '#D1001',
            email: 'customer@example.com',
            status: 'pending',
            totalPrice: '99.00',
            createdAt: new Date().toISOString(),
            lineItems: [
              {
                title: '3D Printing Service',
                quantity: 1,
                originalUnitPrice: '99.00'
              }
            ]
          },
          {
            id: 'gid://shopify/DraftOrder/1234567891',
            name: '#D1002',
            email: 'test@example.com',
            status: 'quoted',
            totalPrice: '199.00',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            lineItems: [
              {
                title: '3D Printing Service',
                quantity: 2,
                originalUnitPrice: '99.50'
              }
            ]
          }
        ],
        total: 2,
        pending: 1,
        quoted: 1,
        note: 'This is mock data. Configure environment variables and redeploy.'
      });
    }

    // 获取查询参数
   //Shopify默认最多返回250条记录
    const { status, limit = 250, email, admin } = req.query;

    // Admin allowlist - 使用统一配置
    const adminWhitelist = getAdminEmails();
    const requesterEmail = (email || '').trim().toLowerCase();
    const isAdminRequest = ['1', 'true', 'yes'].includes((admin || '').toString().toLowerCase());


    // 认证与授权
    if (!requesterEmail) {
      console.warn('❌ 缺少邮箱参数');
      return res.status(401).json({
        success: false,
        error: 'missing_email',
        message: '缺少客户邮箱，无法获取询价单列表'
      });
    }
    if (isAdminRequest && !adminWhitelist.includes(requesterEmail)) {
      console.warn('❌ 管理员权限被拒绝:', {
        requesterEmail,
        adminWhitelist,
        isInWhitelist: adminWhitelist.includes(requesterEmail)
      });
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        message: `您无权查看全部询价单。当前邮箱: ${requesterEmail}，白名单: ${adminWhitelist.join(', ')}`
      });
    }

    // GraphQL查询
    const query = `
      query getDraftOrders($first: Int!, $search: String!) {
        draftOrders(first: $first, query: $search) {
          edges {
            node {
              id
              name
              email
              totalPrice
              createdAt
              updatedAt
              status
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
        }
      }
    `;

    // 调用Shopify Admin API
    const response = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query: query,
        variables: { 
          first: parseInt(limit), 
          // 管理端允许查看全部；普通用户按邮箱过滤
          search: isAdminRequest
            ? (status && status !== 'all' ? `status:${status}` : '')
            : `email:"${requesterEmail}"`
        }
      })
    });

    // 检查 HTTP 响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API HTTP错误:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        storeDomain,
        hasToken: !!accessToken
      });
      throw new Error(`Shopify API请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL错误:', data.errors);
      throw new Error(`GraphQL错误: ${data.errors[0].message}`);
    }

    // 处理响应数据
    const draftOrders = data.data.draftOrders.edges.map(edge => {
      const order = edge.node;
      
      // 从第一个lineItem的customAttributes中提取文件ID和文件数据
      let fileId = null;
      let fileData = null;
      if (order.lineItems.edges.length > 0) {
        const firstLineItem = order.lineItems.edges[0].node;
        const fileIdAttr = firstLineItem.customAttributes.find(attr => attr.key === '文件ID');
        if (fileIdAttr) {
          fileId = fileIdAttr.value;
        }
        
        const fileDataAttr = firstLineItem.customAttributes.find(attr => attr.key === '文件数据');
        if (fileDataAttr && fileDataAttr.value && fileDataAttr.value.startsWith('data:')) {
          fileData = fileDataAttr.value;
        }
      }

      // Get status from customAttributes (support both Chinese and English keys)
      let orderStatus = 'pending';
      if (order.lineItems.edges.length > 0) {
        const firstLineItem = order.lineItems.edges[0].node;
        const statusAttr = firstLineItem.customAttributes.find(attr => attr.key === '状态' || attr.key === 'Status');
        if (statusAttr) {
          const statusValue = (statusAttr.value || '').toString().trim();
          if (statusValue === '已报价' || statusValue === 'Quoted') {
            orderStatus = 'quoted'; // Only "Quoted" is classified as processed
          }
          // "无法加工" / "Not manufacturable" stays as pending (not quoted) for statistics
        }
      }

      return {
        id: order.id,
        name: order.name,
        email: order.email,
        status: orderStatus, // 使用从customAttributes获取的状态
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        invoiceUrl: order.invoiceUrl || 'data:stored',
        fileId: fileId, // 添加文件ID
        fileData: fileData, // 添加文件数据
        note: order.note, // 添加note字段
        lineItems: order.lineItems.edges.map(itemEdge => ({
          id: itemEdge.node.id,
          title: itemEdge.node.title,
          quantity: itemEdge.node.quantity,
          originalUnitPrice: itemEdge.node.originalUnitPrice,
          customAttributes: itemEdge.node.customAttributes
        }))
      };
    });

    // 按邮箱兜底过滤，防止意外漏出（管理员除外）
    let filteredOrders = isAdminRequest
      ? draftOrders
      : draftOrders.filter(order => (order.email || '').toLowerCase() === requesterEmail);

    // 状态过滤
    if (status && status !== 'all') {
      filteredOrders = filteredOrders.filter(order => order.status === status);
    }

    // 计算统计信息
    const total = draftOrders.length;
    const pending = draftOrders.filter(o => o.status === 'pending').length;
    const quoted = draftOrders.filter(o => o.status === 'quoted').length;

    return res.status(200).json({
      success: true,
      message: 'Draft Orders获取成功',
      draftOrders: filteredOrders,
      total: total,
      pending: pending,
      quoted: quoted,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取Draft Orders失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '获取Draft Orders失败',
      timestamp: new Date().toISOString()
    });
  }
}
