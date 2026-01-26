/**
 * CORS config - unified handling for cross-origin requests
 */

export function setCorsHeaders(req, res) {
  // 设置CORS头 - 允许指定的Shopify域名列表
  const allowedOrigins = [
    'https://sain-pdc-test.myshopify.com',
    'https://happy-july.myshopify.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    // 可以在这里添加更多允许的域名
  ];

  // Prefer Origin; fallback to Referer
  const headerOrigin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let origin = headerOrigin;
  if (!origin && referer) {
    try {
      origin = new URL(referer).origin;
    } catch {}
  }

  // Echo allowed origin; default to store domain
  const allow = allowedOrigins.includes(origin) ? origin : 'https://sain-pdc-test.myshopify.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');

  // Allowed methods and headers
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

