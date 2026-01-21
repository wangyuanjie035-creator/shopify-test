/**
 * CORS config - unified handling for cross-origin requests
 */

export function setCorsHeaders(req, res) {
  // Allowed origins (Shopify store + local dev)
  const allowedOrigins = new Set([
    'https://sain-pdc-test.myshopify.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'null',
  ]);

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
  const allow = allowedOrigins.has(origin) ? origin : 'https://sain-pdc-test.myshopify.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');

  // Allowed methods and headers
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

