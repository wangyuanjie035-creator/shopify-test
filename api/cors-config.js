/**
 * CORS配置 - 统一处理跨域请求
 */

export function setCorsHeaders(req, res) {
  console.log('CORS 请求信息:', {
    method: req.method,
    origin: req.headers.origin,
    referer: req.headers.referer,
    url: req.url
  });

  // 允许的来源（Shopify 店铺 + 本地调试）
  const allowedOrigins = new Set([
    'https://sain-pdc-test.myshopify.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://shopify-test-brown.vercel.app'
  ]);

  // 优先使用 Origin，其次从 Referer 提取
  const headerOrigin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let origin = headerOrigin;
  if (!origin && referer) {
    try {
      origin = new URL(referer).origin;
    } catch {}
  }

  // 回显允许的来源，默认店铺域名
  const allow = allowedOrigins.has(origin) ? origin : 'https://sain-pdc-test.myshopify.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');

  // 允许的动词与头
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH,DELETE,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // 如果是 OPTIONS 请求，直接返回 200
  if (req.method === 'OPTIONS') {
    console.log('处理 OPTIONS 预检请求');
    res.status(200).end();
    return true; // 返回 true 表示已处理
  }
  
  return false; // 返回 false 表示需要继续处理
}
