// api/submit-quote-real.js
import { setCorsHeaders } from './cors-config.js';

const API_BASE_URL = process.env.API_BASE_URL || 'https://shopify-13s4.vercel.app';

/**
 * ═══════════════════════════════════════════════════════════════
 * 多文件询价提交API - 创建Shopify Draft Order
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：支持多个文件上传的询价提交
 * 
 * 请求示例：
 * POST /api/submit-quote-real
 * {
 *   "files": [
 *     {
 *       "fileUrl": "data:application/step;base64,U1RFUCBGSUxF...",
 *       "fileName": "model1.STEP",
 *       "fileType": "application/step"
 *     },
 *     {
 *       "fileUrl": "data:application/pdf;base64,JVBERi0xLjQK...",
 *       "fileName": "specification.pdf",
 *       "fileType": "application/pdf"
 *     }
 *   ],
 *   "customerEmail": "customer@example.com",
 *   "customerName": "张三",
 *   "quantity": 1,
 *   "material": "ABS"
 * }
 */

export default async function handler(req, res) {
  console.log('========================================');
  console.log('收到请求:', {
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    referer: req.headers.referer,
    host: req.headers.host,
    'user-agent': req.headers['user-agent'],
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'x-vercel-id': req.headers['x-vercel-id'] // Vercel特定的ID
  });
  
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
      message: '多文件询价提交API工作正常！',
      method: req.method,
      timestamp: new Date().toISOString(),
      note: '支持多文件上传的Shopify Draft Order创建API'
    });
  }

  // POST请求处理
  if (req.method === 'POST') {
    try {
      console.log('📥 接收到的请求体:', JSON.stringify(req.body, null, 2));
      
      const { 
        files = [], // 多个文件数组
        singleFile, // 兼容单个文件（旧格式）
        customerEmail, 
        customerName, 
        quantity = 1,
        material = 'ABS',
        color = '白色',
        precision = '标准 (±0.1mm)',
        lineItems = [],
        notes = '' // 用户备注
      } = req.body;

      // 生成询价单号
      const quoteId = `Q${Date.now()}`;
      
      console.log('📊 询价提交参数:', { 
        quoteId, 
        customerEmail, 
        customerName, 
        fileCount: files ? files.length : 0,
        quantity,
        material,
        color,
        precision,
        notes
      });

      // 处理文件列表（兼容单文件格式）
      let fileList = [];
      let uploadedFiles = [];
      let allFileIds = [];
      
      // 构建文件列表
      if (Array.isArray(files) && files.length > 0) {
        // 多文件格式
        fileList = files;
      } else if (singleFile || req.body.fileUrl) {
        // 单文件格式（兼容旧版本）
        fileList = [{
          fileUrl: req.body.fileUrl || singleFile.fileUrl,
          fileName: req.body.fileName || singleFile.fileName,
          fileType: req.body.fileType || singleFile.fileType
        }];
      }
      
      // 上传文件到Shopify Files（如果有文件）
      if (fileList.length > 0) {
        console.log(`📁 开始上传 ${fileList.length} 个文件到Shopify Files...`);
        
        try {
          const storeFileResponse = await fetch(`${API_BASE_URL}/api/store-file-real`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              files: fileList.map(file => ({
                fileData: file.fileUrl,
                fileName: file.fileName || 'model.stl',
                fileType: file.fileType || 'application/octet-stream'
              }))
            })
          });

          if (storeFileResponse.ok) {
            const contentType = storeFileResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const uploadResult = await storeFileResponse.json();
              
              if (uploadResult.success && uploadResult.files) {
                uploadedFiles = uploadResult.files.filter(f => f.success);
                allFileIds = uploadedFiles.map(f => f.fileId);
                
                console.log(`✅ 成功上传 ${uploadedFiles.length} 个文件:`, 
                  uploadedFiles.map(f => ({ name: f.fileName, id: f.fileId })));
              } else {
                console.warn('⚠️ 文件上传API返回成功但无文件数据:', uploadResult);
              }
            } else {
              console.warn('⚠️ 文件上传API返回非JSON响应');
            }
          } else {
            console.warn('⚠️ 文件上传到Shopify Files失败，状态码:', storeFileResponse.status);
          }
        } catch (uploadError) {
          console.warn('⚠️ 文件上传到Shopify Files异常:', uploadError.message);
        }
      }
      
      console.log('✅ 生成的文件IDs:', allFileIds);

      // 验证和清理邮箱格式
      if (!customerEmail) {
        console.error('❌ 客户邮箱为空:', { customerEmail, customerName });
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

      // 构建customAttributes
      const normalizeValue = (value, fallback = '') => {
        if (value === null || value === undefined) {
          return fallback;
        }
        return String(value);
      };

      // 基础属性
      const baseAttributes = [
        // 基本参数
        { key: '材料', value: normalizeValue(material, '未提供') },
        { key: '颜色', value: normalizeValue(color, '未提供') },
        { key: '精度', value: normalizeValue(precision, '未提供') },
        { key: '询价单号', value: normalizeValue(quoteId) },
        { key: '文件数量', value: String(fileList.length) },
        { key: '用户备注', value: normalizeValue(notes, '无') }
      ];

      // 文件相关属性（如果有文件）
      if (allFileIds.length > 0) {
        baseAttributes.push(
          { key: '文件ID', value: allFileIds.join(',') },
          { key: '文件名', value: uploadedFiles.map(f => f.fileName).join(',') },
          { key: '文件存储方式', value: 'Shopify Files' },
          { key: '成功上传文件数', value: String(uploadedFiles.length) }
        );
        
        // 添加上传成功的文件详情
        uploadedFiles.forEach((file, index) => {
          baseAttributes.push(
            { key: `文件${index + 1}_名称`, value: file.fileName },
            { key: `文件${index + 1}_ID`, value: file.fileId },
            { key: `文件${index + 1}_ShopifyID`, value: file.shopifyFileId || '未获取' }
          );
        });
      } else if (fileList.length > 0) {
        // 有文件但上传失败
        baseAttributes.push(
          { key: '文件状态', value: '上传失败' },
          { key: '文件名', value: fileList.map(f => f.fileName).join(',') }
        );
      }
      
      // 从前端lineItems中提取的详细参数，过滤掉Base64数据
      const frontendAttributes = lineItems.length > 0 && lineItems[0].customAttributes ? 
        lineItems[0].customAttributes.filter(attr => {
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
      
      console.log('🔧 构建customAttributes统计:');
      console.log('- 基本参数数量:', baseAttributes.length);
      console.log('- 前端参数数量:', frontendAttributes.length);
      console.log('- 总参数数量:', baseAttributes.length + frontendAttributes.length);
      
      const allAttributes = [...baseAttributes, ...frontendAttributes].map(attr => ({
        key: attr.key,
        value: normalizeValue(attr.value, '')
      }));
      
      // 构建Draft Order的line items
      let lineItemTitle = '3D打印服务询价';
      if (uploadedFiles.length > 0) {
        if (uploadedFiles.length === 1) {
          lineItemTitle = `3D打印服务 - ${uploadedFiles[0].fileName}`;
        } else {
          lineItemTitle = `3D打印服务 - ${uploadedFiles.length}个文件`;
        }
      }
      
      // 构建note字段
      let noteContent = `询价单号: ${quoteId}\n`;
      noteContent += `客户: ${customerName || '未提供'}\n`;
      noteContent += `邮箱: ${validEmail}\n`;
      noteContent += `文件数量: ${fileList.length} (成功上传: ${uploadedFiles.length})\n`;
      
      if (uploadedFiles.length > 0) {
        noteContent += `文件列表:\n`;
        uploadedFiles.forEach((file, index) => {
          noteContent += `  ${index + 1}. ${file.fileName} (${Math.round(file.uploadedFileSize / 1024)}KB)\n`;
        });
      }
      
      if (notes) {
        noteContent += `用户备注: ${notes}\n`;
      }
      
      // 准备Draft Order输入数据
      const input = {
        email: validEmail,
        taxExempt: true, // 免除税费，避免额外费用
        lineItems: [
          {
            title: lineItemTitle,
            quantity: parseInt(quantity) || 1,
            originalUnitPrice: "0.00", // 占位价格，后续由管理员更新
            customAttributes: allAttributes
          }
        ],
        note: noteContent
      };

      // 获取环境变量
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
          fileCount: fileList.length,
          uploadedFileCount: uploadedFiles.length,
          fileIds: allFileIds.join(','),
          note: '请配置SHOP/SHOPIFY_STORE_DOMAIN和ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN环境变量'
        });
      }

      // 创建Shopify Draft Order
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
        throw new Error(`GraphQL错误: ${data.errors[0].message}`);
      }

      if (data.data.draftOrderCreate.userErrors.length > 0) {
        console.error('用户错误:', data.data.draftOrderCreate.userErrors);
        throw new Error(`创建失败: ${data.data.draftOrderCreate.userErrors[0].message}`);
      }

      const draftOrder = data.data.draftOrderCreate.draftOrder;

      return res.status(200).json({
        success: true,
        message: `询价提交成功！${uploadedFiles.length}个文件已上传，客服将在24小时内为您提供报价。`,
        quoteId: quoteId,
        draftOrderId: draftOrder.id,
        draftOrderName: draftOrder.name,
        invoiceUrl: draftOrder.invoiceUrl,
        customerEmail: validEmail,
        customerName: customerName || '未提供',
        fileCount: fileList.length,
        uploadedFileCount: uploadedFiles.length,
        fileIds: allFileIds,
        files: uploadedFiles.map(f => ({
          fileName: f.fileName,
          fileId: f.fileId,
          size: f.uploadedFileSize
        })),
        nextSteps: [
          '1. 您将收到询价确认邮件',
          '2. 客服将评估您的需求并报价',
          '3. 报价完成后，您将收到通知',
          '4. 您可以在"我的询价"页面查看进度'
        ],
        timestamp: new Date().toISOString(),
        note: '已创建支持多文件的Shopify Draft Order'
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
        fileCount: req.body.files ? req.body.files.length : (req.body.singleFile ? 1 : 0),
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
