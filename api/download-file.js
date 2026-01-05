// Vercel 文件下载 API - 支持多文件打包下载
const FILE_METAOBJECT_TYPE = 'uploaded_file';

// 引入必要的库
import archiver from 'archiver';

// 本地实现 shopGql，避免跨路由导入在 Vercel 中丢失
async function shopGql(query, variables) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;

  if (!storeDomain || !accessToken) {
    return { errors: [{ message: 'Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN' }] };
  }

  const endpoint = `https://${storeDomain}/admin/api/2024-01/graphql.json`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await resp.json();
  return json;
}

import { setCorsHeaders } from './cors-config.js';

// 限制参数：防止滥用
const MAX_FILES_PER_REQUEST = 20;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const REQUEST_TIMEOUT = 300000; // 5分钟

export default async function handler(req, res) {
  // 设置超时
  req.setTimeout(REQUEST_TIMEOUT);
  
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      id, 
      ids,               // 新的多文件参数：逗号分隔的Metaobject文件ID
      shopifyFileId, 
      shopifyFileIds,    // 新的多文件参数：逗号分隔的Shopify文件ID
      fileName: requestedFileName,
      zipName = 'files.zip' // ZIP文件名称
    } = req.query;
    
    // ============== 安全检查 ==============
    // 检查是否有管理员登录（防止滥用）
    if (req.headers['x-admin-token'] !== process.env.ADMIN_SECRET_TOKEN) {
      // 验证用户权限（这里可以添加更复杂的权限验证）
      const sessionToken = req.headers['authorization'] || req.cookies?.session;
      if (!isValidSession(sessionToken)) {
        return res.status(403).json({ error: '未授权访问' });
      }
    }
    
    // ============== 判断下载模式 ==============
    const isMultiFileMode = ids || shopifyFileIds;
    
    if (isMultiFileMode) {
      return await handleMultipleFilesDownload(req, res);
    }
    
    // 如果提供了shopifyFileId，则通过Shopify Files下载
    if (shopifyFileId) {
      return await handleShopifyFileDownload(req, res, shopifyFileId, requestedFileName);
    }
    
    // ============== 原有单文件下载逻辑 ==============
    if (!id) {
      return res.status(400).json({ error: 'Missing file ID' });
    }

    // 查询存储在 Metaobject 中的文件记录
    const query = `
      query($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first) {
          nodes {
            id
            handle
            fields { key value }
          }
        }
      }
    `;

    let nodes = [];
    try {
      const result = await shopGql(query, { type: FILE_METAOBJECT_TYPE, first: 100 });
      if (result?.errors) {
        console.error('GraphQL errors:', result.errors);
      }
      nodes = result?.data?.metaobjects?.nodes || [];
    } catch (gqlErr) {
      console.error('GraphQL request failed:', gqlErr);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件服务暂不可用</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7} .card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)} h1{color:#e67e22;font-size:22px;margin:0 0 12px} p{color:#555;line-height:1.7;margin:8px 0} code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件服务暂不可用</h1><p>文件ID：<code>${id}</code></p><p>后台文件存储服务暂时不可用，请稍后重试，或联系客户重新提供文件。</p></div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(503).send(html);
    }
    
    const fileRecord = nodes.find(node => {
      const f = node.fields.find(x => x.key === 'file_id');
      return f && f.value === id;
    });

    if (!fileRecord) {
      // 特殊处理本地存储的文件ID（我们生成的file_开头的ID）
      if (id.startsWith('file_')) {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>本地存储文件</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7} .card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)} h1{color:#27ae60;font-size:22px;margin:0 0 12px} p{color:#555;line-height:1.7;margin:8px 0} code{background:#f2f2f2;padding:4px 6px;border-radius:4px} .info{background:#e8f5e8;padding:16px;border-radius:6px;border-left:4px solid #27ae60} .download-btn{background:#27ae60;color:white;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:16px;margin:10px 5px} .download-btn:hover{background:#219a52}</style></head><body><div class="card"><h1>📁 本地存储文件</h1><p>文件ID：<code>${id}</code></p><div class="info"><p><strong>说明：</strong>此文件存储在客户浏览器的本地存储中。</p><p><strong>下载方式：</strong>请在客户浏览器中访问此文件ID进行下载。</p><p><strong>注意：</strong>文件仅在客户浏览器中可用，无法通过API直接下载。</p></div><button class="download-btn" onclick="window.close()">关闭</button></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);
      }
      
      // 特殊处理 placeholder 文件ID
      if (id === 'placeholder') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件上传失败</title><style>body{font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7} .card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)} h1{color:#e67e22;font-size:22px;margin:0 0 12px} p{color:#555;line-height:1.7;margin:8px 0} code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件上传失败</h1><p>文件ID：<code>${id}</code></p><p>此文件在上传过程中失败，无法下载。请联系客户重新上传文件。</p></div></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(html);
      }
      
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件不存在</title></head><body>文件不存在：${id}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }

    const getField = (key) => {
      const f = fileRecord.fields.find(x => x.key === key);
      return f ? f.value : '';
    };

    const fileName = getField('file_name') || 'download.bin';
    const fileType = getField('file_type') || 'application/octet-stream';
    const fileData = getField('file_data');
    const fileUrlCdn = getField('file_url');
    
    console.log('文件记录:', { id, fileName, fileType, fileUrlCdn, hasFileData: !!fileData });

    // 如果有 Shopify Files 的 URL，则直接重定向
    if (fileUrlCdn && (fileUrlCdn.startsWith('http://') || fileUrlCdn.startsWith('https://'))) {
      console.log('重定向到 Shopify CDN:', fileUrlCdn);
      res.writeHead(302, { Location: fileUrlCdn });
      return res.end();
    }

    if (!fileData) {
      console.log('文件数据缺失，file_url:', fileUrlCdn);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件数据缺失</title><style>body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;background:#f7f7f7;padding:20px}.card{background:#fff;padding:28px 32px;border-radius:10px;box-shadow:0 3px 16px rgba(0,0,0,.08)}h1{color:#e67e22;font-size:22px;margin:0 0 12px}p{color:#555;line-height:1.7;margin:8px 0}code{background:#f2f2f2;padding:4px 6px;border-radius:4px}</style></head><body><div class="card"><h1>⚠️ 文件数据缺失</h1><p>文件ID：<code>${id}</code></p><p>文件名：<code>${fileName}</code></p><p>此文件的数据未能正确存储。可能的原因：</p><ul><li>文件上传过程中断</li><li>文件过大被截断</li><li>Shopify Files API 存储失败</li></ul><p>建议：请联系客户重新上传文件。</p></div></body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(html);
    }

    const buffer = Buffer.from(fileData, 'base64');
    res.setHeader('Content-Type', fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('文件下载错误:', error);
    return res.status(500).json({ 
      error: '文件下载失败', 
      details: error.message 
    });
  }
}

// ==================== 多文件下载处理 ====================
async function handleMultipleFilesDownload(req, res) {
  try {
    const { 
      ids, 
      shopifyFileIds, 
      zipName = 'files.zip',
      orderNumber = '',
      customerId = ''
    } = req.query;
    
    console.log('开始多文件下载:', { 
      ids, 
      shopifyFileIds, 
      zipName, 
      orderNumber, 
      customerId 
    });
    
    // ============== 验证和限制 ==============
    const fileIdList = ids ? ids.split(',').filter(id => id.trim()) : [];
    const shopifyFileIdList = shopifyFileIds ? shopifyFileIds.split(',').filter(id => id.trim()) : [];
    
    const totalFiles = fileIdList.length + shopifyFileIdList.length;
    
    // 1. 检查文件数量限制
    if (totalFiles === 0) {
      return res.status(400).json({ error: '没有提供有效的文件ID' });
    }
    
    if (totalFiles > MAX_FILES_PER_REQUEST) {
      return res.status(400).json({ 
        error: `文件数量超过限制`, 
        details: `最多支持${MAX_FILES_PER_REQUEST}个文件，当前${totalFiles}个` 
      });
    }
    
    // 2. 生成ZIP文件名
    const finalZipName = orderNumber ? 
      `订单_${orderNumber}_${new Date().getTime()}.zip` : 
      zipName;
    
    // 3. 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalZipName)}"`);
    
    // 4. 创建ZIP压缩流
    const archive = archiver('zip', {
      zlib: { level: 6 } // 压缩级别：0-9，6为平衡选择
    });
    
    // 处理压缩错误
    archive.on('error', (err) => {
      console.error('ZIP压缩错误:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '压缩文件失败', details: err.message });
      }
    });
    
    // 监听完成事件
    archive.on('finish', () => {
      console.log(`ZIP文件创建完成: ${finalZipName}, 总大小: ${archive.pointer()} bytes`);
    });
    
    // 监听进度事件（可选）
    archive.on('progress', (progress) => {
      console.log(`压缩进度: ${progress.entries.processed}/${progress.entries.total} 个文件`);
    });
    
    // 管道到响应
    archive.pipe(res);
    
    // 5. 记录下载统计
    const downloadStats = {
      totalFiles: totalFiles,
      successFiles: 0,
      failedFiles: [],
      totalSize: 0
    };
    
    // 6. 处理Metaobject文件
    for (const fileId of fileIdList) {
      try {
        const fileRecord = await getFileRecordById(fileId);
        if (!fileRecord) {
          downloadStats.failedFiles.push({ 
            id: fileId, 
            error: '文件不存在' 
          });
          continue;
        }
        
        const fileName = getFieldFromRecord(fileRecord, 'file_name') || `file_${fileId}.bin`;
        const fileType = getFieldFromRecord(fileRecord, 'file_type') || 'application/octet-stream';
        const fileData = getFieldFromRecord(fileRecord, 'file_data');
        const fileUrlCdn = getFieldFromRecord(fileRecord, 'file_url');
        
        console.log(`处理文件 ${fileId}: ${fileName}`);
        
        let fileBuffer;
        
        // 如果是Shopify CDN链接
        if (fileUrlCdn && (fileUrlCdn.startsWith('http://') || fileUrlCdn.startsWith('https://'))) {
          try {
            const response = await fetch(fileUrlCdn, { 
              timeout: 30000 
            });
            
            if (!response.ok) {
              throw new Error(`CDN请求失败: ${response.status} ${response.statusText}`);
            }
            
            fileBuffer = await response.buffer();
            console.log(`从CDN获取文件: ${fileName}, 大小: ${fileBuffer.length} bytes`);
          } catch (fetchError) {
            downloadStats.failedFiles.push({ 
              id: fileId, 
              fileName, 
              error: `CDN下载失败: ${fetchError.message}` 
            });
            continue;
          }
        } 
        // 如果是Base64数据
        else if (fileData) {
          try {
            fileBuffer = Buffer.from(fileData, 'base64');
            console.log(`从Base64解码文件: ${fileName}, 大小: ${fileBuffer.length} bytes`);
          } catch (decodeError) {
            downloadStats.failedFiles.push({ 
              id: fileId, 
              fileName, 
              error: `Base64解码失败: ${decodeError.message}` 
            });
            continue;
          }
        } 
        // 数据缺失
        else {
          downloadStats.failedFiles.push({ 
            id: fileId, 
            fileName, 
            error: '文件数据缺失' 
          });
          continue;
        }
        
        // 检查文件大小限制
        if (downloadStats.totalSize + fileBuffer.length > MAX_TOTAL_SIZE) {
          downloadStats.failedFiles.push({ 
            id: fileId, 
            fileName, 
            error: `文件总大小超过${MAX_TOTAL_SIZE / 1024 / 1024}MB限制` 
          });
          continue;
        }
        
        // 添加到ZIP
        archive.append(fileBuffer, { name: fileName });
        
        // 更新统计
        downloadStats.successFiles++;
        downloadStats.totalSize += fileBuffer.length;
        
      } catch (error) {
        console.error(`处理文件 ${fileId} 时出错:`, error);
        downloadStats.failedFiles.push({ 
          id: fileId, 
          error: error.message 
        });
      }
    }
    
    // 7. 处理Shopify Files
    for (const shopifyFileId of shopifyFileIdList) {
      try {
        const fileInfo = await getShopifyFileInfo(shopifyFileId);
        if (!fileInfo || !fileInfo.url) {
          downloadStats.failedFiles.push({ 
            id: shopifyFileId, 
            error: 'Shopify文件不存在' 
          });
          continue;
        }
        
        const response = await fetch(fileInfo.url, { timeout: 30000 });
        if (!response.ok) {
          throw new Error(`下载失败: ${response.status} ${response.statusText}`);
        }
        
        const fileBuffer = await response.buffer();
        const fileName = fileInfo.fileName || `shopify_${shopifyFileId}.bin`;
        
        console.log(`下载Shopify文件: ${fileName}, 大小: ${fileBuffer.length} bytes`);
        
        // 检查文件大小限制
        if (downloadStats.totalSize + fileBuffer.length > MAX_TOTAL_SIZE) {
          downloadStats.failedFiles.push({ 
            id: shopifyFileId, 
            fileName, 
            error: `文件总大小超过${MAX_TOTAL_SIZE / 1024 / 1024}MB限制` 
          });
          continue;
        }
        
        // 添加到ZIP
        archive.append(fileBuffer, { name: fileName });
        
        // 更新统计
        downloadStats.successFiles++;
        downloadStats.totalSize += fileBuffer.length;
        
      } catch (error) {
        console.error(`处理Shopify文件 ${shopifyFileId} 时出错:`, error);
        downloadStats.failedFiles.push({ 
          id: shopifyFileId, 
          error: error.message 
        });
      }
    }
    
    // 8. 如果有失败的文件，创建错误记录
    if (downloadStats.failedFiles.length > 0) {
      const errorLog = [
        '========== 文件下载失败记录 ==========',
        `下载时间: ${new Date().toLocaleString('zh-CN')}`,
        `总文件数: ${downloadStats.totalFiles}`,
        `成功下载: ${downloadStats.successFiles}`,
        `失败文件: ${downloadStats.failedFiles.length}`,
        '--------------------------------------',
        ...downloadStats.failedFiles.map((f, index) => 
          `${index + 1}. 文件ID: ${f.id}\n   文件名: ${f.fileName || '未知'}\n   错误: ${f.error}`
        ),
        '======================================'
      ].join('\n');
      
      archive.append(errorLog, { name: '下载失败记录.txt' });
    }
    
    // 9. 创建下载摘要文件
    const summary = [
      '========== 文件下载摘要 ==========',
      `下载时间: ${new Date().toLocaleString('zh-CN')}`,
      `ZIP文件名: ${finalZipName}`,
      `订单号: ${orderNumber || '未指定'}`,
      `客户ID: ${customerId || '未指定'}`,
      `总文件数: ${downloadStats.totalFiles}`,
      `成功下载: ${downloadStats.successFiles}`,
      `失败文件: ${downloadStats.failedFiles.length}`,
      `总大小: ${formatFileSize(downloadStats.totalSize)}`,
      '=================================='
    ].join('\n');
    
    archive.append(summary, { name: '下载摘要.txt' });
    
    // 10. 完成压缩
    await archive.finalize();
    
    console.log('多文件下载完成:', downloadStats);
    
  } catch (error) {
    console.error('多文件下载错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: '多文件打包失败', 
        details: error.message,
        suggestion: '请尝试减少文件数量或联系管理员'
      });
    }
  }
}

// ==================== 辅助函数 ====================

// 根据ID获取Metaobject文件记录
async function getFileRecordById(id) {
  const query = `
    query($type: String!, $filter: MetaobjectFilter) {
      metaobjects(type: $type, first: 1, filter: $filter) {
        nodes {
          id
          handle
          fields { key value }
        }
      }
    }
  `;
  
  const filter = {
    field: "file_id",
    value: id
  };
  
  try {
    const result = await shopGql(query, { 
      type: FILE_METAOBJECT_TYPE, 
      filter 
    });
    
    if (result?.errors) {
      console.error('查询文件记录时GraphQL错误:', result.errors);
      return null;
    }
    
    return result?.data?.metaobjects?.nodes?.[0] || null;
  } catch (error) {
    console.error('获取文件记录失败:', error);
    return null;
  }
}

// 从记录中获取字段值
function getFieldFromRecord(record, key) {
  const field = record?.fields?.find(x => x.key === key);
  return field ? field.value : '';
}

// 获取Shopify文件信息
async function getShopifyFileInfo(fileId) {
  const query = `
    query($id: ID!) {
      file(id: $id) {
        ... on GenericFile {
          url
          originalFileSize
          contentType
          originalFilename
        }
        ... on MediaImage {
          image {
            url
          }
          alt
        }
      }
    }
  `;
  
  try {
    const result = await shopGql(query, { id: fileId });
    
    if (!result?.data?.file) {
      console.error('Shopify文件不存在:', fileId);
      return null;
    }
    
    const file = result.data.file;
    let url = null;
    let fileName = `shopify_${fileId}`;
    
    // 获取URL和文件名
    if (file.url) {
      url = file.url;
    } else if (file.image?.url) {
      url = file.image.url;
    }
    
    if (file.originalFilename) {
      fileName = file.originalFilename;
    } else if (file.alt) {
      fileName = file.alt;
    }
    
    return {
      url,
      fileName,
      contentType: file.contentType || 'application/octet-stream',
      size: file.originalFileSize || 0
    };
    
  } catch (error) {
    console.error('获取Shopify文件信息失败:', error);
    return null;
  }
}

// 处理Shopify文件下载（单文件）
async function handleShopifyFileDownload(req, res, shopifyFileId, fileName) {
  try {
    console.log('开始下载Shopify文件:', { shopifyFileId, fileName });

    // 构建GraphQL查询来获取文件URL
    const query = `
      query($id: ID!) {
        file(id: $id) {
          ... on GenericFile {
            url
            originalFileSize
            contentType
          }
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    `;

    const result = await shopGql(query, { id: shopifyFileId });

    if (!result.data.file) {
      return res.status(404).json({ error: '文件未找到' });
    }

    const file = result.data.file;
    let fileUrl = null;

    // 获取文件URL
    if (file.url) {
      fileUrl = file.url;
    } else if (file.image && file.image.url) {
      fileUrl = file.image.url;
    }

    if (!fileUrl) {
      return res.status(404).json({ error: '文件URL不可用' });
    }

    console.log('文件URL获取成功:', fileUrl);

    // 设置下载头并重定向到文件URL
    const finalFileName = fileName || 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
    return res.redirect(302, fileUrl);

  } catch (error) {
    console.error('Shopify文件下载失败:', error);
    return res.status(500).json({
      error: '文件下载失败',
      message: error.message
    });
  }
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 简单的会话验证（根据实际情况实现）
function isValidSession(sessionToken) {
  // TODO: 实现实际的会话验证逻辑
  // 这里只是一个示例，实际应该检查数据库或缓存中的会话
  return sessionToken && sessionToken.length > 10;
}