const { setCorsHeaders } = require('./cors-config');

module.exports = async (req, res) => {
  // 设置CORS头
  setCorsHeaders(res);

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const shop = process.env.SHOP;
    const adminToken = process.env.ADMIN_TOKEN;

    if (!shop || !adminToken) {
      throw new Error('Missing environment variables: SHOP or ADMIN_TOKEN');
    }

    const shopifyDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    const graphqlEndpoint = `https://${shopifyDomain}/admin/api/2024-01/graphql.json`;

    // 首先尝试查找现有的"3D打印服务"产品
    const searchProductsQuery = `
      query searchProducts($query: String!) {
        products(first: 10, query: $query) {
          edges {
            node {
              id
              title
              handle
              variants(first: 1) {
                edges {
                  node {
                    id
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }
    `;

    console.log('🔍 搜索现有产品...');
    
    const searchResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: searchProductsQuery,
        variables: {
          query: 'title:3D打印服务 OR title:3D Printing Service'
        }
      })
    });

    const searchResult = await searchResponse.json();
    console.log('搜索结果:', searchResult);

    if (searchResult.data?.products?.edges?.length > 0) {
      const product = searchResult.data.products.edges[0].node;
      const variantId = product.variants.edges[0].node.id;
      
      console.log('✅ 找到现有产品:', product.title, '变体ID:', variantId);
      
      return res.status(200).json({
        success: true,
        productId: variantId,
        productTitle: product.title,
        message: '使用现有产品'
      });
    }

    // 如果没有找到，创建新产品
    console.log('📦 创建新产品...');
    
    const createProductMutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  price
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createResponse = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: createProductMutation,
        variables: {
          input: {
            title: '3D打印服务',
            handle: '3d-printing-service',
            productType: 'Service',
            vendor: 'Custom',
            tags: ['3D打印', '定制服务', '报价'],
            descriptionHtml: '<p>专业的3D打印定制服务</p>',
            variants: [{
              price: '0.00',
              title: 'Default Title',
              inventoryManagement: 'SHOPIFY'
            }]
          }
        }
      })
    });

    const createResult = await createResponse.json();
    console.log('创建结果:', createResult);

    if (createResult.data?.productCreate?.userErrors?.length > 0) {
      throw new Error(`创建产品失败: ${createResult.data.productCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    const newProduct = createResult.data.productCreate.product;
    const variantId = newProduct.variants.edges[0].node.id;

    console.log('✅ 新产品创建成功:', newProduct.title, '变体ID:', variantId);

    return res.status(200).json({
      success: true,
      productId: variantId,
      productTitle: newProduct.title,
      message: '新产品创建成功'
    });

  } catch (error) {
    console.error('❌ 获取或创建产品失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: '无法获取或创建产品'
    });
  }
};
