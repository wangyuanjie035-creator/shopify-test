// api/store-file-real.js
import { Blob } from 'buffer';
import FormData from 'form-data';
import { setCorsHeaders } from './cors-config.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * 多文件存储API - 使用Shopify Staged Upload
 * ═══════════════════════════════════════════════════════════════
 * 
 * 功能：将多个Base64文件数据上传到Shopify Files
 * 
 * 请求示例：
 * POST /api/store-file-real
 * {
 *   "files": [
 *     {
 *       "fileData": "data:application/step;base64,U1RFUCBGSUxF...",
 *       "fileName": "model1.STEP",
 *       "fileType": "application/step"
 *     },
 *     {
 *       "fileData": "data:application/pdf;base64,JVBERi0xLjQK...",
 *       "fileName": "specification.pdf",
 *       "fileType": "application/pdf"
 *     }
 *   ]
 * }
 */

export default async function handler(req, res) {
  console.log('========================================');
   // 详细记录请求信息
  console.log('请求方法:', req.method);
  console.log('请求头:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    origin: req.headers.origin
  });
  
  // 记录原始请求体（只记录前500字符避免日志过大）
  const rawBody = JSON.stringify(req.body || {}).substring(0, 500);
  console.log('原始请求体（前500字符）:', rawBody);
  
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      // 验证请求体
      if (!req.body) {
        return res.status(400).json({
          success: false,
          message: '请求体为空'
        });
      }
      
      console.log('完整请求体键名:', Object.keys(req.body));
      
      // 支持两种格式：多文件和单文件
      let fileList = [];
      
      // 检查是否有 files 数组
      if (req.body.files && Array.isArray(req.body.files)) {
        console.log('使用 files 数组格式，数量:', req.body.files.length);
        fileList = req.body.files;
        
        // 验证每个文件都有必要的字段
        fileList.forEach((file, index) => {
          console.log(`文件 ${index + 1}:`, {
            fileName: file.fileName,
            hasFileData: !!file.fileData,
            fileDataLength: file.fileData ? file.fileData.length : 0,
            fileType: file.fileType
          });
        });
      }
      // 检查是否有 singleFile（兼容旧格式）
      else if (req.body.singleFile) {
        console.log('使用 singleFile 格式');
        fileList = [req.body.singleFile];
      }
      // 检查是否有直接的文件参数（最旧格式）
      else if (req.body.fileData) {
        console.log('使用直接文件参数格式');
        fileList = [{
          fileData: req.body.fileData,
          fileName: req.body.fileName || 'model.stl',
          fileType: req.body.fileType || 'application/octet-stream'
        }];
      }
      else {
        console.log('无法识别的请求格式:', Object.keys(req.body));
        return res.status(400).json({
          success: false,
          message: '缺少必要参数：files（文件数组）或 singleFile（单个文件）',
          receivedKeys: Object.keys(req.body)
        });
      }

      if (fileList.length === 0) {
        return res.status(400).json({
          success: false,
          message: '没有需要上传的文件'
        });
      }

      console.log(`📁 开始处理 ${fileList.length} 个文件...`);

      // 验证每个文件都有必要的字段
      const invalidFiles = [];
      fileList.forEach((file, index) => {
        if (!file.fileData || !file.fileName) {
          invalidFiles.push({
            index,
            fileName: file.fileName || `文件${index + 1}`,
            missing: [!file.fileData && 'fileData', !file.fileName && 'fileName'].filter(Boolean)
          });
        }
      });

      if (invalidFiles.length > 0) {
        console.log('无效的文件:', invalidFiles);
        return res.status(400).json({
          success: false,
          message: '部分文件缺少必要参数',
          invalidFiles,
          details: `缺少参数: ${invalidFiles.map(f => f.missing.join(', ')).join('; ')}`
        });
      }

      console.log(`📁 开始上传 ${fileList.length} 个文件...`);

      // 获取环境变量
      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

      if (!storeDomain || !accessToken) {
        return res.status(500).json({
          success: false,
          message: '环境变量未配置：SHOP/SHOPIFY_STORE_DOMAIN 和 ADMIN_TOKEN/SHOPIFY_ACCESS_TOKEN'
        });
      }

      // 用于存储上传结果
      const uploadResults = [];

      // 遍历并上传每个文件
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const { fileData, fileName, fileType } = file;

        if (!fileData || !fileName) {
          console.warn(`⚠️ 跳过第 ${i + 1} 个文件：缺少 fileData 或 fileName`);
          uploadResults.push({
            success: false,
            fileName: fileName || `文件${i + 1}`,
            error: '缺少必要参数'
          });
          continue;
        }

        try {
          // 解析Base64数据
          const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
          const fileBuffer = Buffer.from(base64Data, 'base64');
          const fileSize = fileBuffer.length;

          console.log(`📁 上传文件 ${i + 1}/${fileList.length}: ${fileName}, 大小: ${fileSize} 字节`);

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
                  mimeType: fileType || 'application/octet-stream',
                  resource: 'FILE'
                }]
              }
            })
          });

          const stagedUploadData = await stagedUploadResponse.json();
          
          if (stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors.length > 0) {
            console.error(`❌ Staged Upload创建失败:`, stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors);
            uploadResults.push({
              success: false,
              fileName,
              error: 'Staged Upload创建失败',
              details: stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors
            });
            continue;
          }

          const stagedTarget = stagedUploadData.data.stagedUploadsCreate.stagedTargets[0];

          // 步骤2: 上传文件到临时地址
          const parameters = Array.isArray(stagedTarget.parameters) ? stagedTarget.parameters : [];
          const hasPolicy = parameters.some(param => param.name === 'policy');

          let uploadResponse;
          if (hasPolicy) {
            // S3 风格：需要 multipart/form-data
            const boundary = `----formdata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const parts = [];
            
            parameters.forEach(param => {
              parts.push(`--${boundary}\r\n`);
              parts.push(`Content-Disposition: form-data; name="${param.name}"\r\n\r\n`);
              parts.push(`${param.value}\r\n`);
            });
            
            parts.push(`--${boundary}\r\n`);
            parts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
            parts.push(`Content-Type: ${fileType || 'application/octet-stream'}\r\n\r\n`);
            
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
            // GCS Signed URL 场景
            const contentTypeParam = parameters.find(param => param.name === 'content_type');
            const method = 'POST';
            const headers = {
              'Content-Type': contentTypeParam ? contentTypeParam.value : (fileType || 'application/octet-stream'),
              'Content-Length': fileBuffer.length.toString(),
              'x-goog-content-sha256': 'UNSIGNED-PAYLOAD'
            };
            uploadResponse = await fetch(stagedTarget.url, {
              method,
              headers,
              body: fileBuffer
            });
          }

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error(`❌ 文件上传失败: ${fileName}`, uploadResponse.status, uploadResponse.statusText);
            uploadResults.push({
              success: false,
              fileName,
              error: '文件上传到临时地址失败',
              details: `${uploadResponse.status} - ${uploadResponse.statusText}`
            });
            continue;
          }

          console.log(`✅ 文件上传到临时地址成功: ${fileName}`);

          // 步骤3: 创建永久文件记录
          const fileCreateMutation = `
            mutation fileCreate($files: [FileCreateInput!]!) {
              fileCreate(files: $files) {
                files {
                  id
                  fileStatus
                  originalFileSize
                  url
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
                  contentType: fileType || 'application/octet-stream',
                  alt: fileName
                }]
              }
            })
          });

          const fileCreateData = await fileCreateResponse.json();

          if (fileCreateData.errors || fileCreateData.data.fileCreate.userErrors.length > 0) {
            console.error(`❌ 文件记录创建失败: ${fileName}`, fileCreateData.errors || fileCreateData.data.fileCreate.userErrors);
            uploadResults.push({
              success: false,
              fileName,
              error: '文件记录创建失败',
              details: fileCreateData.errors || fileCreateData.data.fileCreate.userErrors
            });
            continue;
          }

          const fileRecord = fileCreateData.data.fileCreate.files[0];
          
          // 生成文件ID
          const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          uploadResults.push({
            success: true,
            fileId,
            fileName,
            fileUrl: fileRecord.url,
            shopifyFileId: fileRecord.id,
            originalFileSize: fileRecord.originalFileSize,
            uploadedFileSize: fileSize,
            sizeMatch: fileRecord.originalFileSize === fileSize,
            index: i + 1,
            timestamp: new Date().toISOString()
          });

          console.log(`✅ 文件上传成功 ${i + 1}/${fileList.length}: ${fileName} (ID: ${fileId})`);

        } catch (error) {
          console.error(`❌ 文件 ${i + 1} 上传失败:`, error);
          uploadResults.push({
            success: false,
            fileName: file.fileName || `文件${i + 1}`,
            error: error.message,
            index: i + 1
          });
        }
      }

      // 统计上传结果
      const successfulUploads = uploadResults.filter(r => r.success);
      const failedUploads = uploadResults.filter(r => !r.success);

      return res.status(200).json({
        success: true,
        message: `文件上传完成，成功: ${successfulUploads.length}/${fileList.length}, 失败: ${failedUploads.length}`,
        totalFiles: fileList.length,
        successful: successfulUploads.length,
        failed: failedUploads.length,
        files: uploadResults,
        fileIds: successfulUploads.map(f => f.fileId).join(','),
        summary: {
          totalSize: successfulUploads.reduce((sum, file) => sum + (file.uploadedFileSize || 0), 0),
          fileTypes: successfulUploads.map(f => f.fileName.split('.').pop()).filter((v, i, a) => a.indexOf(v) === i)
        }
      });

    } catch (error) {
      console.error('❌ 文件存储API错误:', error);
      return res.status(500).json({
        success: false,
        message: '文件存储API错误',
        error: error.message
      });
    }
  }

  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['POST', 'OPTIONS']
  });
}
