// test-production-api.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const testApi = async () => {
  const apiUrl = 'https://shopify-test-brown.vercel.app/api/store-file-real';
  console.log(`正在测试生产环境API: ${apiUrl}\n`);

  try {
    // 1. 测试OPTIONS预检请求
    console.log('1️⃣ 测试 OPTIONS (预检) 请求...');
    const optionsRes = await fetch(apiUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://sain-pdc-test.myshopify.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    console.log(`   ✅ OPTIONS 响应状态: ${optionsRes.status}`);
    console.log(`   ⚙️  响应头: Access-Control-Allow-Origin = "${optionsRes.headers.get('access-control-allow-origin')}"\n`);

    // 2. 测试GET请求（预期应返回405 Method Not Allowed，而非404）
    console.log('2️⃣ 测试 GET 请求...');
    const getRes = await fetch(apiUrl);
    console.log(`   ✅ GET 响应状态: ${getRes.status}`);
    if (getRes.status === 404) {
      console.log(`   ❌ 关键问题：API端点返回404 (Not Found)，这意味着它可能未被Vercel正确部署或识别。`);
    }
    
    // 3. （可选）简单测试同服务器的另一个已知API
    console.log('\n3️⃣ 快速测试同一服务器的另一个端点（例如test-cors）...');
    try {
      const otherRes = await fetch('https://shopify-test-brown.vercel.app/api/test-cors');
      console.log(`   ✅ /api/test-cors 响应状态: ${otherRes.status}`);
    } catch (otherError) {
      console.log(`   ⚠️  无法测试其他端点: ${otherError.message}`);
    }

  } catch (error) {
    console.error('❌ 测试过程中发生网络错误:', error.message);
    console.error('   这可能意味着：');
    console.error('   1. 网络连接问题');
    console.error('   2. API服务器完全无响应');
    console.error('   3. 域名解析失败');
  }
};

testApi();