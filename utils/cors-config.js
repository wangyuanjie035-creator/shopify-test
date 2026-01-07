/**
 * CORS配置 - 统一处理跨域请求
 */

export function setCorsHeaders(req, res) {
  // 允许的来源（Shopify 店铺 + 本地调试）
  const allowedOrigins = new Set([
    'https://sain-pdc-test.myshopify.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'null',
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
  // 确保总是设置 Access-Control-Allow-Origin 头
  const allow = allowedOrigins.has(origin) ? origin : 'https://sain-pdc-test.myshopify.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');

  // 允许的动词与头
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // 调试日志（仅在开发环境）
  if (process.env.NODE_ENV !== 'production') {
    console.log('CORS Headers Set:', {
      origin: origin || '(empty)',
      allow: allow,
      method: req.method
    });
  }
}

