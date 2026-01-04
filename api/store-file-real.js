import { Blob } from 'buffer';
import FormData from 'form-data';
import { setCorsHeaders } from '../utils/cors-config.js';

// 统一判断文件类别，Shopify fileCreate 只接受枚举类型
// 注意：STEP/STP 在 Shopify 不被当作 MODEL_3D 支持，按 FILE 处理
const MODEL_EXTENSIONS = ['stl', 'obj', '3mf', 'glb', 'gltf', '3ds', 'ply'];
function determineContentCategory(fileType, fileName) {
  const mime = (fileType || '').toLowerCase();
  const ext = (fileName || '').toLowerCase().split('.').pop();

  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.includes('model') && !['model/step', 'model/x.stp', 'application/step', 'application/octet-stream'].includes(mime)) {
    return 'MODEL_3D';
  }
  if (MODEL_EXTENSIONS.includes(ext)) return 'MODEL_3D';
  return 'FILE';
}

function determineMimeType(fileType, fileName) {
  const mime = (fileType || '').toLowerCase();
  const ext = (fileName || '').toLowerCase().split('.').pop();

  const mapByExt = {
    step: 'model/step',
    stp: 'model/step',
    stl: 'model/stl',
    obj: 'model/obj',
    '3mf': 'model/3mf',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    '3ds': 'model/3ds',
    ply: 'model/ply',
  };

  if (mapByExt[ext]) return mapByExt[ext];
  if (mime) return mime;
  return 'application/octet-stream';
}

/**
 * ═══════════════════════════════════════════════════════════════
 * 真实文件存储API - 使用Shopify Staged Upload
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：将Base64文件数据上传到Shopify Files
 * 
 * 用途：
 * - 确保文件大小与原始上传一致
 * - 使用Shopify CDN存储，提供更好的性能
 * - 支持大文件上传（最大100MB）
 * 
 * 请求示例：
 * POST /api/store-file-real
 * {
 *   "fileData": "data:application/step;base64,U1RFUCBGSUxF...",
 *   "fileName": "model.STEP",
 *   "fileType": "application/step"
 * }
 */

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { fileData, fileName, fileType } = req.body;

      if (!fileData || !fileName) {
        return res.status(400).json({
          success: false,
          message: '缺少必要参数：fileData 和 fileName'
        });
      }

      // 解析Base64数据
      const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const fileSize = fileBuffer.length;

      const contentCategory = determineContentCategory(fileType, fileName);
      const mimeType = determineMimeType(fileType, fileName);
      // 如果分类为 FILE，则 resource 也用 FILE，mime 用 octet-stream（STEP/STP 走此分支）
      const resourceType = contentCategory === 'MODEL_3D' ? 'MODEL_3D' : 'FILE';
      const stagedMimeType = resourceType === 'MODEL_3D' ? mimeType : 'application/octet-stream';

      console.log(`📁 开始上传文件: ${fileName}, 大小: ${fileSize} 字节`, { fileType, contentCategory });

      // 获取环境变量
      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

      if (!storeDomain || !accessToken) {
        return res.status(500).json({
          success: false,
          message: '环境变量未配置：SHOP/SHOPIFY_STORE_DOMAIN 和 ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN'
        });
      }

      // 步骤1: 创建Staged Upload
      const stagedUploadMutation = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters {
                name
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const stagedUploadResponse = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: stagedUploadMutation,
          variables: {
            input: [{
              filename: fileName,
              mimeType: stagedMimeType,
              resource: resourceType
            }]
          }
        })
      });

      const stagedUploadData = await stagedUploadResponse.json();
      
      const stagedUserErrors = stagedUploadData?.data?.stagedUploadsCreate?.userErrors || [];
      if (stagedUploadData.errors || stagedUserErrors.length > 0) {
        console.error('❌ Staged Upload创建失败:', JSON.stringify(stagedUserErrors, null, 2), ' raw=', JSON.stringify(stagedUploadData, null, 2));
        return res.status(500).json({
          success: false,
          message: 'Staged Upload创建失败',
          error: stagedUploadData.errors || stagedUserErrors
        });
      }

      const stagedTarget = stagedUploadData.data.stagedUploadsCreate.stagedTargets[0];
      console.log('✅ Staged Upload创建成功:', stagedTarget);

      // 步骤2: 上传文件到临时地址
      const parameters = Array.isArray(stagedTarget.parameters) ? stagedTarget.parameters : [];
      const hasPolicy = parameters.some(param => param.name === 'policy');

      let uploadResponse;
      if (hasPolicy) {
        // S3 风格：需要 multipart/form-data，包含 policy/signature 等字段
        const boundary = `----formdata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const parts = [];
        
        parameters.forEach(param => {
          parts.push(`--${boundary}\r\n`);
          parts.push(`Content-Disposition: form-data; name="${param.name}"\r\n\r\n`);
          parts.push(`${param.value}\r\n`);
        });
        
        parts.push(`--${boundary}\r\n`);
        parts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
        parts.push(`Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`);
        
        const textParts = parts.join('');
        const textBuffer = Buffer.from(textParts, 'utf8');
        const fileEnding = Buffer.from('\r\n', 'utf8');
        const endBoundary = Buffer.from(`--${boundary}--\r\n`, 'utf8');
        const uploadBuffer = Buffer.concat([textBuffer, fileBuffer, fileEnding, endBoundary]);

        const uploadHeaders = {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': uploadBuffer.length.toString(),
          'x-goog-content-sha256': 'UNSIGNED-PAYLOAD'
        };
        
        uploadResponse = await fetch(stagedTarget.url, {
          method: 'POST',
          headers: uploadHeaders,
          body: uploadBuffer
        });
      } else {
        // GCS Signed URL 场景：Shopify 预签名中已包含所有必要信息，通常使用 PUT 原始文件
        const contentTypeParam = parameters.find(param => param.name === 'content_type');
        const method = 'PUT';
        const headers = {
          'Content-Type': contentTypeParam ? contentTypeParam.value : (fileType || 'application/octet-stream')
          // 不额外设置 content-length / x-goog-content-sha256，避免签名不匹配
        };
        uploadResponse = await fetch(stagedTarget.url, {
          method,
          headers,
          body: fileBuffer
        });
      }

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('❌ 文件上传失败:', uploadResponse.status, uploadResponse.statusText, errorText);
        return res.status(500).json({
          success: false,
          message: '文件上传到临时地址失败',
          error: `${uploadResponse.status} - ${uploadResponse.statusText}`,
          details: errorText
        });
      }

      console.log('✅ 文件上传到临时地址成功');

      // 步骤3: 创建永久文件记录
      const fileCreateMutation = `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              fileStatus
              ... on GenericFile {
                url
                originalFileSize
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const fileCreateResponse = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          query: fileCreateMutation,
          variables: {
            files: [{
              originalSource: stagedTarget.resourceUrl,
              // contentType 必须是 Shopify 枚举，3D 模型用 MODEL_3D，其余用 FILE
              contentType: contentCategory === 'MODEL_3D' ? 'MODEL_3D' : 'FILE',
              alt: fileName || ''
            }]
          }
        })
      });

      const fileCreateData = await fileCreateResponse.json();
      const userErrors = fileCreateData?.data?.fileCreate?.userErrors || [];
      const createdFiles = fileCreateData?.data?.fileCreate?.files || [];

      if (fileCreateData.errors || userErrors.length > 0 || createdFiles.length === 0) {
        console.error('❌ 文件记录创建失败: userErrors=', JSON.stringify(userErrors, null, 2), ' raw=', JSON.stringify(fileCreateData, null, 2));
        return res.status(500).json({
          success: false,
          message: '文件记录创建失败',
          error: fileCreateData.errors || userErrors || fileCreateData
        });
      }

      const fileRecord = createdFiles[0];
      const shopifyFileUrl = fileRecord.url || stagedTarget.resourceUrl;
      const shopifyFileSize = fileRecord.originalFileSize || fileSize;
      console.log('✅ 文件记录创建成功:', fileRecord.id, 'url:', shopifyFileUrl);

      // 生成文件ID（内部关联用）
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 步骤4：写入 uploaded_file Metaobject，便于后续下载
      const metaobjectCreateMutation = `
        mutation createUploadedFile($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject { id }
            userErrors { field message }
          }
        }
      `;

      const metaInput = {
        type: 'uploaded_file',
        handle: fileId,
        fields: [
          { key: 'file_id', value: fileId },
          { key: 'file_name', value: fileName || '' },
          { key: 'file_type', value: mimeType },
          { key: 'file_url', value: shopifyFileUrl || '' },
          { key: 'shopify_file_id', value: fileRecord.id },
          { key: 'file_size', value: String(shopifyFileSize || fileSize) },
          { key: 'upload_time', value: new Date().toISOString() }
        ]
      };

      try {
        const metaResp = await fetch(`https://${storeDomain}/admin/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          },
          body: JSON.stringify({
            query: metaobjectCreateMutation,
            variables: { metaobject: metaInput }
          })
        });
        const metaJson = await metaResp.json();
        const metaErrors = metaJson?.data?.metaobjectCreate?.userErrors || [];
        if (metaJson.errors || metaErrors.length > 0) {
          console.warn('⚠️ Metaobject 写入失败（非致命）：', JSON.stringify(metaErrors || metaJson, null, 2));
        } else {
          console.log('✅ Metaobject 写入成功:', metaJson?.data?.metaobjectCreate?.metaobject?.id);
        }
      } catch (metaErr) {
        console.warn('⚠️ Metaobject 写入异常（非致命）：', metaErr.message);
      }

      return res.status(200).json({
        success: true,
        message: '文件上传成功（Shopify Files完整存储）',
        fileId,
        fileName,
        shopifyFileId: fileRecord.id,
        shopifyFileUrl,
        originalFileSize: shopifyFileSize,
        uploadedFileSize: fileSize,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ 文件存储失败:', error);
      return res.status(500).json({
        success: false,
        message: '文件存储失败',
        error: error.message
      });
    }
  }

  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['POST', 'OPTIONS']
  });
}
