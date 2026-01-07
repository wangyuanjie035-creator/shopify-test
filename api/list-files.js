/**
 * 列出所有API文件 - 用于检查部署
 */

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // 列出所有API文件
  const apiFiles = [
    'store-file-real.js',
    'submit-quote-real.js',
    'update-quote.js',
    'get-draft-order-simple.js',
    'get-draft-orders.js',
    'download-file.js',
    'download-order-files.js',
    'delete-draft-order.js',
    'send-invoice-email.js',
    'test-cors.js',
    'list-files.js'
  ];
  
  return res.status(200).json({
    success: true,
    message: 'API文件列表',
    baseUrl: process.env.VERCEL_URL || 'https://shopify-v587.vercel.app',
    timestamp: new Date().toISOString(),
    files: apiFiles.map(file => ({
      name: file,
      path: `/api/${file.replace('.js', '')}`,
      testUrl: `${process.env.VERCEL_URL || 'https://shopify-v587.vercel.app'}/api/${file.replace('.js', '')}`
    })),
    environment: {
      hasShop: !!process.env.SHOP || !!process.env.SHOPIFY_STORE_DOMAIN,
      hasToken: !!process.env.ADMIN_TOKEN || !!process.env.SHOPIFY_ACCESS_TOKEN,
      nodeEnv: process.env.NODE_ENV || 'production'
    }
  });
}
