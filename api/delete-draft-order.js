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
 *   "draftOrderId": "gid://shopify/DraftOrder/123456789"
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "message": "Draft Order删除成功",
 *   "deletedId": "gid://shopify/DraftOrder/123456789"
 * }
 */

export default async function handler(req, res) {
  // 设置CORS头 - 允许Shopify域名
  res.setHeader('Access-Control-Allow-Origin', 'https://sain-pdc-test.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 只接受DELETE请求
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { draftOrderId } = req.body;

    if (!draftOrderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing draftOrderId parameter' 
      });
    }

    console.log('开始删除Draft Order:', draftOrderId);

    // 获取环境变量 - 支持多种变量名
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
    
    if (!storeDomain || !accessToken) {
      console.log('环境变量未配置，返回模拟删除结果');
      return res.status(200).json({
        success: true,
        message: '环境变量未配置，模拟删除成功',
        deletedId: draftOrderId,
        note: '请配置SHOP/SHOPIFY_STORE_DOMAIN和ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN环境变量'
      });
    }

    // GraphQL删除查询
    const deleteMutation = `
      mutation draftOrderDelete($input: DraftOrderDeleteInput!) {
        draftOrderDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
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
        query: deleteMutation,
        variables: { 
          input: { id: draftOrderId }
        }
      })
    });

    const data = await response.json();
    console.log('Shopify API响应:', data);

    if (data.errors) {
      console.error('GraphQL错误:', data.errors);
      throw new Error(`GraphQL错误: ${data.errors[0].message}`);
    }

    if (data.data.draftOrderDelete.userErrors.length > 0) {
      console.error('用户错误:', data.data.draftOrderDelete.userErrors);
      throw new Error(`删除失败: ${data.data.draftOrderDelete.userErrors[0].message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Draft Order删除成功',
      deletedId: data.data.draftOrderDelete.deletedId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('删除Draft Order失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '删除Draft Order失败',
      timestamp: new Date().toISOString()
    });
  }
}
