// api/submit-quote-real.js
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
      console.log('📥 接收到的请求体大小:', req.headers['content-length']);
      
      const { 
        customerEmail, 
        customerName, 
        lineItems = [],
        files = [] // 接收文件数组
      } = req.body;

      // 生成询价单号
      const quoteId = `Q${Date.now()}`;
      
      console.log('📊 解析后的参数:', { 
        quoteId, 
        customerEmail, 
        customerName, 
        lineItemsCount: lineItems.length,
        filesCount: files.length
      });

      // 验证和清理邮箱格式
      if (!customerEmail) {
        console.error('❌ 客户邮箱为空');
        throw new Error('客户邮箱不能为空，请确保已正确登录或输入客户信息');
      }
      
      let validEmail = customerEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(validEmail)) {
        console.error('❌ 邮箱格式无效:', { customerEmail, validEmail });
        throw new Error(`邮箱格式无效: ${customerEmail}`);
      }
      
      console.log('使用的邮箱:', validEmail);

      // --- 多文件上传逻辑 ---
      const uploadedFilesInfo = [];
      if (files && files.length > 0) {
        console.log(`📁 开始上传 ${files.length} 个文件到Shopify Files...`);
        
        const uploadPromises = files.map(async (file, index) => {
          try {
            const storeFileResponse = await fetch(`${API_BASE_URL}/api/store-file-real`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileData: file.fileData,
                fileName: file.fileName || `file-${index + 1}`,
                fileType: 'application/octet-stream' // 可以根据文件类型动态设置
              })
            });

            if (storeFileResponse.ok) {
              const shopifyFileInfo = await storeFileResponse.json();
              console.log(`✅ 文件 ${file.fileName} 上传成功:`, shopifyFileInfo);
              return { ...shopifyFileInfo, originalFileName: file.fileName, isMain: file.isMain };
            } else {
              console.warn(`⚠️ 文件 ${file.fileName} 上传失败，状态码:`, storeFileResponse.status);
              return { error: `Upload failed with status ${storeFileResponse.status}`, originalFileName: file.fileName };
            }
          } catch (uploadError) {
            console.error(`❌ 文件 ${file.fileName} 上传异常:`, uploadError.message);
            return { error: uploadError.message, originalFileName: file.fileName };
          }
        });

        const results = await Promise.all(uploadPromises);
        uploadedFilesInfo.push(...results.filter(r => !r.error));
        
        const uploadErrors = results.filter(r => r.error);
        if (uploadErrors.length > 0) {
            console.warn(`⚠️ ${uploadErrors.length} 个文件上传失败:`, uploadErrors);
        }
      }
      console.log('✅ 所有文件处理完成，成功上传:', uploadedFilesInfo.length);

      // --- 构建 Line Items 和 Custom Attributes ---
      if (lineItems.length === 0) {
        throw new Error('请求中必须包含至少一个 line item。');
      }

      // 将所有文件信息添加到第一个 line item 的 custom attributes 中
      const mainLineItem = lineItems[0];
      const newCustomAttributes = mainLineItem.customAttributes || [];

      newCustomAttributes.push({ key: '询价单号', value: quoteId });

      uploadedFilesInfo.forEach((fileInfo, index) => {
        newCustomAttributes.push({ key: `文件 ${index + 1} 名称`, value: fileInfo.originalFileName });
        newCustomAttributes.push({ key: `文件 ${index + 1} 类型`, value: fileInfo.isMain ? '主文件 (3D)' : '关联文件 (2D)' });
        newCustomAttributes.push({ key: `文件 ${index + 1} Shopify ID`, value: fileInfo.shopifyFileId || 'N/A' });
        newCustomAttributes.push({ key: `文件 ${index + 1} URL`, value: fileInfo.shopifyFileUrl || 'N/A' });
      });

      mainLineItem.customAttributes = newCustomAttributes;

      // --- 创建Shopify Draft Order ---
      const createDraftOrderMutation = `
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              invoiceUrl
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      const input = {
        email: validEmail,
        taxExempt: true,
        lineItems: lineItems.map(item => ({
            title: item.title,
            quantity: item.quantity,
            originalUnitPrice: "0.00",
            customAttributes: item.customAttributes
        })),
        note: `询价单号: ${quoteId}\n客户: ${customerName || '未提供'}\n总文件数: ${files.length}\n成功上传数: ${uploadedFilesInfo.length}`
      };

      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
      
      if (!storeDomain || !accessToken) {
        console.log('环境变量未配置，返回模拟数据');
        return res.status(200).json({
          success: true,
          message: '环境变量未配置，返回模拟数据',
          quoteId: quoteId,
          draftOrderId: `gid://shopify/DraftOrder/mock-${Date.now()}`,
          note: '请配置SHOP/SHOPIFY_STORE_DOMAIN和ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN环境变量'
        });
      }

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
      console.log('Shopify API响应:', JSON.stringify(data, null, 2));

      if (data.errors) {
        console.error('GraphQL错误:', data.errors);
        throw new Error(`GraphQL错误: ${JSON.stringify(data.errors)}`);
      }

      if (data.data.draftOrderCreate.userErrors.length > 0) {
        console.error('用户错误:', data.data.draftOrderCreate.userErrors);
        throw new Error(`创建失败: ${data.data.draftOrderCreate.userErrors.map(e => e.message).join(', ')}`);
      }

      const draftOrder = data.data.draftOrderCreate.draftOrder;

      return res.status(200).json({
        success: true,
        message: '询价提交成功！客服将在24小时内为您提供报价。',
        quoteId: quoteId,
        draftOrderId: draftOrder.id,
        draftOrderName: draftOrder.name,
        invoiceUrl: draftOrder.invoiceUrl,
        timestamp: new Date().toISOString(),
        note: '已创建真实的Shopify Draft Order并上传了多个文件'
      });

    } catch (error) {
      console.error('创建Draft Order失败:', error);
      return res.status(500).json({
        success: false,
        message: `服务器内部错误: ${error.message}`,
        error: error.stack
      });
    }
  }

  // 其他方法
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'POST', 'OPTIONS']
  });
}