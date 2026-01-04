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
  console.log('请求方法:', req.method);
  console.log('请求头:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    origin: req.headers.origin
  });

  const rawBody = JSON.stringify(req.body || {}).substring(0, 500);s
  console.log('原始请求体（前500字符）:', rawBody);

  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      if (!req.body || !req.body.files || !Array.isArray(req.body.files)) {
        return res.status(400).json({
          success: false,
          message: '请求体必须包含一个 "files" 数组。'
        });
      }

      const fileList = req.body.files;
      if (fileList.length === 0) {
        return res.status(400).json({ success: false, message: '没有需要上传的文件。' });
      }

      console.log(`📁 开始处理 ${fileList.length} 个文件的批量上传...`);

      const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

      if (!storeDomain || !accessToken) {
        return res.status(500).json({ success: false, message: '环境变量未配置: SHOPIFY_STORE_DOMAIN 和 SHOPIFY_ACCESS_TOKEN。' });
      }

      // 步骤 1: 批量创建 Staged Uploads
      const stagedUploadInputs = fileList.map(file => ({
        filename: file.fileName,
        mimeType: file.fileType || 'application/octet-stream',
        resource: 'FILE',
        httpMethod: 'POST'
      }));

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
          variables: { input: stagedUploadInputs }
        })
      });

      const stagedUploadData = await stagedUploadResponse.json();

      if (stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors.length > 0) {
        console.error('❌ 批量 Staged Upload 创建失败:', stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors);
        return res.status(500).json({
          success: false,
          message: '批量 Staged Upload 创建失败。',
          details: stagedUploadData.errors || stagedUploadData.data.stagedUploadsCreate.userErrors
        });
      }

      const stagedTargets = stagedUploadData.data.stagedUploadsCreate.stagedTargets;
      console.log(`✅ 成功创建 ${stagedTargets.length} 个 Staged Uploads。`);

      // 步骤 2: 并行上传文件到临时地址
      const uploadPromises = stagedTargets.map(async (target, index) => {
        const file = fileList[index];
        const { fileData, fileName, fileType } = file;

        try {
          const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
          const fileBuffer = Buffer.from(base64Data, 'base64');

          const formData = new FormData();
          target.parameters.forEach(({ name, value }) => {
            formData.append(name, value);
          });
          formData.append('file', fileBuffer, {
            filename: fileName,
            contentType: fileType || 'application/octet-stream',
          });

          const uploadResponse = await fetch(target.url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error(`❌ 文件上传失败: ${fileName}`, { status: uploadResponse.status, error: errorText });
            return { success: false, fileName, error: '上传到临时地址失败。', details: errorText };
          }

          console.log(`✅ 文件上传到临时地址成功: ${fileName}`);
          return { success: true, fileName, resourceUrl: target.resourceUrl, fileType, originalFileSize: fileBuffer.length };
        } catch (error) {
          console.error(`❌ 文件 ${fileName} 上传准备或执行时出错:`, error);
          return { success: false, fileName, error: error.message };
        }
      });

      const uploadResults = await Promise.all(uploadPromises);
      const successfulUploads = uploadResults.filter(r => r.success);

      if (successfulUploads.length === 0) {
        return res.status(500).json({
          success: false,
          message: '所有文件都未能成功上传到临时地址。',
          files: uploadResults
        });
      }
      
      console.log(`📤 ${successfulUploads.length}/${fileList.length} 个文件已成功上传到临时存储。`);

      // 步骤 3: 批量创建永久文件记录
      const fileCreateInputs = successfulUploads.map(upload => ({
        originalSource: upload.resourceUrl,
        contentType: 'FILE',
        alt: upload.fileName
      }));

      const fileCreateMutation = `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              ... on GenericFile {
                id
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
          variables: { files: fileCreateInputs }
        })
      });

      const fileCreateData = await fileCreateResponse.json();

      if (fileCreateData.errors || fileCreateData.data.fileCreate.userErrors.length > 0) {
        console.error('❌ 批量文件记录创建失败:', fileCreateData.errors || fileCreateData.data.fileCreate.userErrors);
        return res.status(500).json({
          success: false,
          message: '批量文件记录创建失败。',
          details: fileCreateData.errors || fileCreateData.data.fileCreate.userErrors
        });
      }

      const createdFiles = fileCreateData.data.fileCreate.files;
      console.log(`✅ 成功创建 ${createdFiles.length} 个永久文件记录。`);

      // 将创建的文件与原始文件信息匹配起来 (依赖 Shopify 返回顺序)
      const finalResults = successfulUploads.map((upload, index) => {
        const createdFile = createdFiles[index];
        const originalFile = fileList.find(f => f.fileName === upload.fileName);
        if (createdFile) {
          return {
            success: true,
            fileName: upload.fileName,
            fileUrl: createdFile.url,
            shopifyFileId: createdFile.id,
            originalFileSize: createdFile.originalFileSize,
            // 附加原始文件信息
            fileId: originalFile.fileId, 
            config: originalFile.config
          };
        } else {
           return { success: false, fileName: upload.fileName, error: '文件记录创建后未找到。' };
        }
      });

      return res.status(200).json({
        success: true,
        message: `批量上传完成。成功: ${successfulUploads.length}/${fileList.length}`,
        files: finalResults
      });

    } catch (error) {
      console.error('❌ 文件存储API错误:', error);
      return res.status(500).json({
        success: false,
        message: '文件存储API内部错误。',
        error: error.message
      });
    }
  }

  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['POST', 'OPTIONS']
  });
}
