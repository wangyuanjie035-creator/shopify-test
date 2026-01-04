// api/cors-config.js
/**
 * CORS配置 - 统一处理跨域请求
 */

export function setCorsHeaders(req, res) {
  console.log('CORS 请求信息:', {
    method: req.method,
    origin: req.headers.origin,
    referer: req.headers.referer,
    url: req.url,
    host: req.headers.host
  });

  // 允许的来源（Shopify 店铺 + 本地调试 + 你的Vercel域名）
  const allowedOrigins = new Set([
    'https://sain-pdc-test.myshopify.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://shopify-v587.vercel.app',
  ]);

  // 优先使用 Origin，其次从 Referer 提取
  const headerOrigin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let origin = headerOrigin;
  if (!origin && referer) {
    try {
      origin = new URL(referer).origin;
    } catch (e) {
      console.log('解析 Referer 失败:', e.message);
    }
  }

  // 如果请求来自Shopify Admin（iframe），则允许任何来源（或者特定的店铺域名）
  const shopifyAdminOrigin = req.headers['sec-fetch-site'];
  const shopifyShop = req.headers['x-shopify-shop-domain'];
  
  // 回显允许的来源
  let allowOrigin = '';
  
  // 如果请求来自已知来源
  if (allowedOrigins.has(origin)) {
    allowOrigin = origin;
  } 
  // 如果是Shopify店铺请求
  else if (shopifyShop && shopifyShop.endsWith('.myshopify.com')) {
    allowOrigin = `https://${shopifyShop}`;
  }
  // 默认使用主店铺域名
  else {
    allowOrigin = 'https://sain-pdc-test.myshopify.com';
  }

  console.log('设置 CORS 头:', { origin, allowOrigin, shopifyShop, shopifyAdminOrigin });

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');

  // 允许的动词与头
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH,DELETE,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, X-Total-Count');

  // 注意：不要在这里处理 OPTIONS 请求，由路由自己处理
}