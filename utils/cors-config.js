/**
 * CORS config - unified handling for cross-origin requests
 * 
 * 统一管理所有允许的 Shopify 域名，避免在多个文件中重复配置
 * 使用方法：
 *   setCorsHeaders(req, res); // 默认方法：GET,POST,OPTIONS
 *   setCorsHeaders(req, res, 'GET,OPTIONS'); // 自定义方法
 *   setCorsHeaders(req, res, 'POST,DELETE,OPTIONS'); // 支持 DELETE
 */

export function setCorsHeaders(req, res, allowedMethods = 'GET,POST,OPTIONS') {
  // 设置CORS头 - 允许指定的Shopify域名列表
  // 统一在这里管理所有允许的域名，添加新域名只需修改这里
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
  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

