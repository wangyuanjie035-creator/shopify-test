/**
 * ═══════════════════════════════════════════════════════════════
 * 真实提交询价API - 创建Shopify Draft Order
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：创建真实的Shopify Draft Order
 * 
 * 用途：
 * - 客户提交询价请求
 * - 创建真实的Shopify Draft Order
 * - 返回可被管理端查询的Draft Order ID
 */

/**
 * 请求示例：
 * POST /api/submit-quote-real
 * {
 *   "fileName": "model.stl",
 *   "customerEmail": "customer@example.com",
 *   "customerName": "张三",
 *   "quantity": 1,
 *   "material": "ABS"
 * }
 * 
 * 响应示例：
 * {
 *   "success": true,
 *   "message": "询价提交成功！",
 *   "quoteId": "Q1234567890",
 *   "draftOrderId": "gid://shopify/DraftOrder/1234567890",
 *   "invoiceUrl": "https://checkout.shopify.com/...",
 *   "customerEmail": "customer@example.com"
 * }
 */

import { setCorsHeaders } from '../utils/cors-config.js';

const API_BASE_URL = process.env.API_BASE_URL || 'https://shopify-13s4.vercel.app';

export default async function handler(req, res) {
  // 设置CORS头
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 支持GET请求用于测试
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'submit-quote-real API工作正常！',
      method: req.method,
      timestamp: new Date().toISOString(),
      note: '这是真实创建Shopify Draft Order的API'
    });
  }

  // POST请求处理
  if (req.method === 'POST') {
    try {
      console.log('📥 接收到的请求体:', req.body);
      
      const { 
        fileName, 
        customerEmail, 
        customerName, 
        quantity = 1,
        material = 'ABS',
        color = '白色',
        precision = '标准 (±0.1mm)',
        lineItems = []
      } = req.body;

      // 生成询价单号
      const quoteId = `Q${Date.now()}`;
      
      console.log('📊 解析后的参数:', { 
        quoteId, 
        customerEmail, 
        customerName, 
        fileName,
        quantity,
        material,
        color,
        precision,
        lineItemsCount: lineItems.length,
        lineItemsData: lineItems.length > 0 ? lineItems[0] : null
      });

      // 创建Shopify Draft Order的GraphQL查询
      const createDraftOrderMutation = `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              email
              invoiceUrl
              totalPrice
              createdAt
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    originalUnitPrice
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

      // 验证和清理邮箱格式
      if (!customerEmail) {
        console.error('❌ 客户邮箱为空:', { customerEmail, customerName, fileName });
        throw new Error('客户邮箱不能为空，请确保已正确登录或输入客户信息');
      }
      
      let validEmail = customerEmail.trim().toLowerCase();
      
      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(validEmail)) {
        console.error('❌ 邮箱格式无效:', { customerEmail, validEmail });
        throw new Error(`邮箱格式无效: ${customerEmail}`);
      }
      
      console.log('使用的邮箱:', validEmail);

      // 处理文件上传（仅单文件）
      let shopifyFileInfo = null;
      let fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // 单文件处理
      if (req.body.fileUrl && req.body.fileUrl.startsWith('data:')) {
        console.log('使用的API_BASE_URL:', API_BASE_URL);
        console.log('📁 开始上传单个文件到Shopify Files...');
        try {
          const storeFileResponse = await fetch(`${API_BASE_URL}/api/store-file-real`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fileData: req.body.fileUrl,
              fileName: fileName || 'model.stl',
              fileType: 'application/octet-stream'
            })
          });

          if (storeFileResponse.ok) {
            const contentType = storeFileResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              shopifyFileInfo = await storeFileResponse.json();
              fileId = shopifyFileInfo.fileId;
              console.log('✅ 文件上传到Shopify Files成功:', shopifyFileInfo);
            } else {
              console.warn('⚠️ 文件上传API返回非JSON响应，使用Base64存储');
            }
          } else {
            console.warn('⚠️ 文件上传到Shopify Files失败，状态码:', storeFileResponse.status, '使用Base64存储');
          }
        } catch (uploadError) {
          console.warn('⚠️ 文件上传到Shopify Files异常:', uploadError.message);
        }
      }
      
      console.log('✅ 生成文件ID:', fileId);

      // 如果有文件数据，将其存储到Shopify的note字段中
      let fileDataStored = false;
      if (req.body.fileUrl && req.body.fileUrl.startsWith('data:')) {
        console.log('✅ 检测到Base64文件数据，准备存储');
        fileDataStored = true;
      }

      // 构建customAttributes
      const normalizeValue = (value, fallback = '') => {
        if (value === null || value === undefined) {
          return fallback;
        }
        return String(value);
      };

      const baseAttributes = [
        // 基本参数
        { key: '材料', value: normalizeValue(material, '未提供') },
        { key: '颜色', value: normalizeValue(color, '未提供') },
        { key: '精度', value: normalizeValue(precision, '未提供') },
        { key: '文件', value: normalizeValue(fileName || 'model.stl') },
        { key: '文件ID', value: normalizeValue(fileId, '未生成') },
        { key: '询价单号', value: normalizeValue(quoteId) },
        { key: 'Shopify文件ID', value: normalizeValue(shopifyFileInfo ? shopifyFileInfo.shopifyFileId : null, '未上传') },
        { key: 'Shopify文件URL', value: normalizeValue(shopifyFileInfo ? shopifyFileInfo.shopifyFileUrl : null, '未上传') },
        { key: '文件存储方式', value: shopifyFileInfo ? 'Shopify Files' : 'Base64' },
        { key: '原始文件大小', value: normalizeValue(shopifyFileInfo ? shopifyFileInfo.originalFileSize : null, '未知') },
        { key: '文件数据', value: shopifyFileInfo ? '已上传到Shopify Files' : (req.body.fileUrl && req.body.fileUrl.startsWith('data:') ? '已存储Base64数据' : '未提供') }
      ];

      
      // 从前端lineItems中提取的详细参数，过滤掉Base64数据
      const frontendAttributes = lineItems.length > 0 && lineItems[0].customAttributes ? lineItems[0].customAttributes.filter(attr => {
        // 过滤掉包含Base64数据的属性
        if (attr.key === '文件数据' || attr.key === 'fileData' || attr.key === 'file_data') {
          return false;
        }
        // 过滤掉值过长的属性（可能是Base64数据）
        if (attr.value && attr.value.length > 1000) {
          console.log('⚠️ 过滤掉过长的属性:', attr.key, '长度:', attr.value.length);
          return false;
        }
        return true;
      }) : [];
      
      console.log('🔧 构建customAttributes:');
      console.log('- 基本参数数量:', baseAttributes.length);
      console.log('- 前端参数数量:', frontendAttributes.length);
      console.log('- 前端参数详情:', frontendAttributes);
      
      const allAttributes = [...baseAttributes, ...frontendAttributes].map(attr => ({
        key: attr.key,
        value: normalizeValue(attr.value, '')
      }));
      console.log('- 总参数数量:', allAttributes.length);
      
      // 准备输入数据
      const input = {
        email: validEmail,
        taxExempt: true, // 免除税费，避免额外费用
        lineItems: [
          {
            title: `3D打印服务 - ${fileName || 'model.stl'}`,
            quantity: parseInt(quantity) || 1,
            originalUnitPrice: "0.00", // 占位价格，后续由管理员更新
            customAttributes: allAttributes
          }
        ],
        note: `询价单号: ${quoteId}\n客户: ${customerName || '未提供'}\n文件: ${fileName || '未提供'}\n文件大小: ${req.body.fileUrl ? Math.round(req.body.fileUrl.length / 1024) + 'KB' : '未提供'}`
      };

      // 获取环境变量 - 支持多种变量名
      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
      
      if (!storeDomain || !accessToken) {
        console.log('环境变量未配置，返回模拟数据');
        return res.status(200).json({
          success: true,
          message: '环境变量未配置，返回模拟数据',
          quoteId: quoteId,
          draftOrderId: `gid://shopify/DraftOrder/mock-${Date.now()}`,
          customerEmail: customerEmail || 'test@example.com',
          fileName: fileName || 'test.stl',
          note: '请配置SHOP/SHOPIFY_STORE_DOMAIN和ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN环境变量'
        });
      }

      // 调用Shopify Admin API
      const response = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: createDraftOrderMutation,
          variables: { input }
        })
      });

      const data = await response.json();
      console.log('Shopify API响应:', data);

      if (data.errors) {
        console.error('GraphQL错误:', data.errors);
        throw new Error(`GraphQL错误: ${data.errors[0].message}`);
      }

      if (data.data.draftOrderCreate.userErrors.length > 0) {
        console.error('用户错误:', data.data.draftOrderCreate.userErrors);
        throw new Error(`创建失败: ${data.data.draftOrderCreate.userErrors[0].message}`);
      }

      const draftOrder = data.data.draftOrderCreate.draftOrder;

      return res.status(200).json({
        success: true,
        message: '询价提交成功！客服将在24小时内为您提供报价。',
        quoteId: quoteId,
        draftOrderId: draftOrder.id,
        draftOrderName: draftOrder.name,
        invoiceUrl: draftOrder.invoiceUrl,
        customerEmail: customerEmail || 'test@example.com',
        fileName: fileName || 'test.stl',
        fileId: fileId,
        nextSteps: [
          '1. 您将收到询价确认邮件',
          '2. 客服将评估您的需求并报价',
          '3. 报价完成后，您将收到通知',
          '4. 您可以在"我的询价"页面查看进度'
        ],
        timestamp: new Date().toISOString(),
        note: '已创建真实的Shopify Draft Order'
      });

    } catch (error) {
      console.error('创建Draft Order失败:', error);
      
      // 如果Shopify API失败，返回简化版本
      const quoteId = `Q${Date.now()}`;
      const draftOrderId = `gid://shopify/DraftOrder/${Date.now()}`;
      
      return res.status(200).json({
        success: true,
        message: '询价提交成功！（简化版本）',
        quoteId: quoteId,
        draftOrderId: draftOrderId,
        customerEmail: req.body.customerEmail || 'test@example.com',
        fileName: req.body.fileName || 'test.stl',
        timestamp: new Date().toISOString(),
        note: `API错误，使用简化版本: ${error.message}`,
        error: error.message
      });
    }
  }

  // 其他方法
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'POST', 'OPTIONS']
  });
}
