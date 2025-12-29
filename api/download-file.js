// Vercel 文件下载 API - 智能多文件下载
// 单个文件ID：直接下载
// 多个文件ID：打包成ZIP下载
const FILE_METAOBJECT_TYPE = 'uploaded_file';

// 导入必要的模块
import { setCorsHeaders } from './cors-config.js';
import JSZip from 'jszip';

// shopGql 函数保持不变
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

// 分页查询Metaobject记录
async function getMetaobjectRecords(fileIds) {
  const allRecords = [];
  let hasNextPage = true;
  let cursor = null;
  let pageCount = 0;
  const maxPages = 10; // 防止无限循环

  // 构建ID集合用于快速查找
  const idSet = new Set(Array.isArray(fileIds) ? fileIds : [fileIds]);
  const foundIds = new Set();

  while (hasNextPage && pageCount < maxPages && foundIds.size < idSet.size) {
    pageCount++;
    
    const query = `
      query($type: String!, $first: Int!, $after: String) {
        metaobjects(type: $type, first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            handle
            fields { key value }
          }
        }
      }
    `;

    try {
      const result = await shopGql(query, { 
        type: FILE_METAOBJECT_TYPE, 
        first: 50, 
        after: cursor 
      });

      if (result?.errors) {
        console.error('GraphQL分页查询错误:', result.errors);
        break;
      }

      const nodes = result?.data?.metaobjects?.nodes || [];
      
      // 筛选出我们需要的文件记录
      for (const node of nodes) {
        const fileIdField = node.fields.find(x => x.key === 'file_id');
        if (fileIdField && idSet.has(fileIdField.value)) {
          allRecords.push({
            id: fileIdField.value,
            node: node
          });
          foundIds.add(fileIdField.value);
        }
      }

      // 更新分页信息
      hasNextPage = result?.data?.metaobjects?.pageInfo?.hasNextPage || false;
      cursor = result?.data?.metaobjects?.pageInfo?.endCursor || null;
      
      // 如果已经找到所有文件，提前结束
      if (foundIds.size >= idSet.size) {
        break;
      }
      
    } catch (error) {
      console.error('分页查询失败:', error);
      break;
    }
  }

  return allRecords;
}

// 从文件记录中提取字段值
function getFieldValue(node, key) {
  const field = node.fields.find(x => x.key === key);
  return field ? field.value : '';
}

// 处理单个文件下载
async function handleSingleFileDownload(res, fileRecord, requestedFileName) {
  const node = fileRecord.node;
  const fileName = getFieldValue(node, 'file_name') || requestedFileName || 'download.bin';
  const fileType = getFieldValue(node, 'file_type') || 'application/octet-stream';
  const fileData = getFieldValue(node, 'file_data');
  const fileUrlCdn = getFieldValue(node, 'file_url');

  console.log('处理单个文件下载:', { fileName, fileType, hasFileData: !!fileData, hasFileUrl: !!fileUrlCdn });

  // 1. 优先使用Shopify CDN URL（重定向）
  if (fileUrlCdn && (fileUrlCdn.startsWith('http://') || fileUrlCdn.startsWith('https://'))) {
    console.log('重定向到Shopify CDN:', fileUrlCdn);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.writeHead(302, { Location: fileUrlCdn });
    return res.end();
  }

  // 2. 使用base64编码的文件数据
  if (fileData) {
    const buffer = Buffer.from(fileData, 'base64');
    res.setHeader('Content-Type', fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  }

  // 3. 文件数据缺失
  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>文件数据缺失</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
      .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
      h1 { color: #e67e22; font-size: 22px; margin: 0 0 12px; }
      p { color: #555; line-height: 1.7; margin: 8px 0; }
      code { background: #f2f2f2; padding: 4px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>⚠️ 文件数据缺失</h1>
      <p>文件ID：<code>${fileRecord.id}</code></p>
      <p>文件名：<code>${fileName}</code></p>
      <p>此文件的数据未能正确存储，无法下载。</p>
    </div>
  </body>
  </html>`;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(500).send(html);
}

// 处理多个文件下载（打包为ZIP）
async function handleMultipleFilesDownload(res, fileRecords, requestedFileNames = {}) {
  console.log(`开始打包${fileRecords.length}个文件...`);

  try {
    const zip = new JSZip();
    let addedFiles = 0;
    let missingFiles = 0;

    // 为每个文件创建ZIP条目
    for (const fileRecord of fileRecords) {
      const node = fileRecord.node;
      const fileId = fileRecord.id;
      const fileName = getFieldValue(node, 'file_name') || requestedFileNames[fileId] || `file_${fileId}.bin`;
      const fileType = getFieldValue(node, 'file_type') || 'application/octet-stream';
      const fileData = getFieldValue(node, 'file_data');
      const fileUrlCdn = getFieldValue(node, 'file_url');

      // 1. 如果有base64数据，直接添加到ZIP
      if (fileData) {
        const buffer = Buffer.from(fileData, 'base64');
        zip.file(fileName, buffer);
        addedFiles++;
        console.log(`已添加文件到ZIP: ${fileName} (${buffer.length} bytes)`);
      }
      // 2. 如果有CDN URL，尝试下载后添加到ZIP
      else if (fileUrlCdn && (fileUrlCdn.startsWith('http://') || fileUrlCdn.startsWith('https://'))) {
        try {
          console.log(`正在从CDN下载: ${fileUrlCdn}`);
          const response = await fetch(fileUrlCdn);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            zip.file(fileName, buffer);
            addedFiles++;
            console.log(`已下载并添加文件到ZIP: ${fileName} (${buffer.length} bytes)`);
          } else {
            // 下载失败，创建错误说明文件
            const errorContent = `文件下载失败\n文件ID: ${fileId}\nURL: ${fileUrlCdn}\n状态码: ${response.status}`;
            zip.file(`ERROR_${fileName}.txt`, errorContent);
            missingFiles++;
            console.warn(`CDN文件下载失败: ${fileUrlCdn}, 状态: ${response.status}`);
          }
        } catch (fetchError) {
          const errorContent = `文件获取失败\n文件ID: ${fileId}\nURL: ${fileUrlCdn}\n错误: ${fetchError.message}`;
          zip.file(`ERROR_${fileName}.txt`, errorContent);
          missingFiles++;
          console.error(`CDN文件获取异常: ${fileUrlCdn}`, fetchError);
        }
      }
      // 3. 无可用数据，创建错误说明文件
      else {
        const errorContent = `文件数据不可用\n文件ID: ${fileId}\n文件名: ${fileName}\n原因: 无文件数据或CDN链接`;
        zip.file(`MISSING_${fileName}.txt`, errorContent);
        missingFiles++;
        console.warn(`文件数据缺失: ${fileId}`);
      }
    }

    // 如果没有成功添加任何文件
    if (addedFiles === 0) {
      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>无法打包文件</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
          .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
          h1 { color: #e67e22; font-size: 22px; margin: 0 0 12px; }
          p { color: #555; line-height: 1.7; margin: 8px 0; }
          ul { margin: 12px 0; padding-left: 20px; }
          li { margin: 6px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚠️ 无法打包文件</h1>
          <p>请求的文件都无法下载或数据缺失。</p>
          <p>请检查文件ID是否正确，或联系管理员。</p>
        </div>
      </body>
      </html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }

    // 生成ZIP文件
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });

    // 设置响应头
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const zipFileName = `files_${timestamp}_${addedFiles}files.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    
    // 添加ZIP文件信息头
    res.setHeader('X-ZIP-Files-Count', addedFiles);
    res.setHeader('X-ZIP-Missing-Files', missingFiles);
    res.setHeader('X-ZIP-Total-Size', zipBuffer.length);
    
    console.log(`ZIP打包完成: ${zipFileName}, 大小: ${zipBuffer.length} bytes, 文件数: ${addedFiles}, 缺失: ${missingFiles}`);
    
    return res.status(200).send(zipBuffer);

  } catch (zipError) {
    console.error('ZIP打包失败:', zipError);
    
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>打包失败</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
        .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
        h1 { color: #e67e22; font-size: 22px; margin: 0 0 12px; }
        p { color: #555; line-height: 1.7; margin: 8px 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚠️ 文件打包失败</h1>
        <p>创建ZIP文件时发生错误：${zipError.message}</p>
        <p>请稍后重试，或联系技术支持。</p>
      </div>
    </body>
    </html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(html);
  }
}

// 处理Shopify文件下载（单个文件）
async function handleShopifyFileDownload(req, res, shopifyFileId, fileName) {
  try {
    console.log('开始下载Shopify文件:', { shopifyFileId, fileName });

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

    if (file.url) {
      fileUrl = file.url;
    } else if (file.image && file.image.url) {
      fileUrl = file.image.url;
    }

    if (!fileUrl) {
      return res.status(404).json({ error: '文件URL不可用' });
    }

    console.log('文件URL获取成功:', fileUrl);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName || 'download'}"`);
    return res.redirect(302, fileUrl);

  } catch (error) {
    console.error('Shopify文件下载失败:', error);
    return res.status(500).json({
      error: '文件下载失败',
      message: error.message
    });
  }
}

// 处理Shopify多文件下载（直接返回文件列表）
async function handleShopifyMultipleFilesDownload(req, res, shopifyFileIds, fileNames = {}) {
  try {
    console.log('开始处理Shopify多文件下载:', { shopifyFileIds, fileNames });

    // 如果没有提供文件名映射，创建默认映射
    const fileList = Array.isArray(shopifyFileIds) ? shopifyFileIds : [shopifyFileIds];
    
    if (fileList.length === 1) {
      // 单个文件，直接使用单个文件下载逻辑
      return await handleShopifyFileDownload(req, res, fileList[0], fileNames[fileList[0]] || 'download');
    }

    // 多个Shopify文件，创建下载页面让用户选择
    const query = `
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on GenericFile {
            id
            url
            originalFileSize
            contentType
          }
          ... on MediaImage {
            id
            image {
              url
            }
          }
        }
      }
    `;

    const result = await shopGql(query, { ids: fileList });
    
    if (result.errors) {
      console.error('GraphQL错误:', result.errors);
      return res.status(500).json({ error: '获取文件信息失败' });
    }

    const files = result.data?.nodes || [];
    
    // 生成下载页面
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>多个文件下载</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
        .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
        h1 { color: #3498db; font-size: 24px; margin: 0 0 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .file-list { list-style: none; padding: 0; margin: 20px 0; }
        .file-item { 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          padding: 15px; 
          border: 1px solid #e0e0e0; 
          border-radius: 6px; 
          margin-bottom: 12px;
          background: #f9f9f9;
          transition: all 0.2s ease;
        }
        .file-item:hover { 
          background: #e8f4fd; 
          border-color: #3498db;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(52, 152, 219, 0.2);
        }
        .file-info { flex: 1; }
        .file-name { 
          font-weight: bold; 
          color: #2c3e50; 
          margin-bottom: 5px;
          font-size: 16px;
        }
        .file-id { 
          color: #7f8c8d; 
          font-size: 12px; 
          font-family: monospace;
          background: #f1f1f1;
          padding: 2px 6px;
          border-radius: 3px;
          display: inline-block;
        }
        .file-size { color: #95a5a6; font-size: 13px; margin-left: 10px; }
        .download-btn {
          background: linear-gradient(135deg, #3498db, #2980b9);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
          text-decoration: none;
          display: inline-block;
          transition: all 0.2s ease;
        }
        .download-btn:hover {
          background: linear-gradient(135deg, #2980b9, #1c5d87);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(52, 152, 219, 0.3);
        }
        .download-all-btn {
          background: linear-gradient(135deg, #27ae60, #219a52);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          margin-top: 20px;
          width: 100%;
          transition: all 0.2s ease;
        }
        .download-all-btn:hover {
          background: linear-gradient(135deg, #219a52, #1a7c40);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(39, 174, 96, 0.3);
        }
        .file-count {
          background: #3498db;
          color: white;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 14px;
          margin-left: 10px;
        }
        .instructions {
          background: #f8f9fa;
          border-left: 4px solid #3498db;
          padding: 15px;
          border-radius: 6px;
          margin: 20px 0;
          font-size: 14px;
          color: #555;
        }
        .instructions h3 {
          margin-top: 0;
          color: #3498db;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📁 多个文件下载 <span class="file-count">${files.length} 个文件</span></h1>
        
        <div class="instructions">
          <h3>下载说明：</h3>
          <p>您有以下两种下载方式：</p>
          <ul>
            <li>点击每个文件旁边的"下载"按钮单独下载文件</li>
            <li>或者点击页面底部的"打包下载所有文件"按钮，将所有文件打包成ZIP下载</li>
          </ul>
          <p><strong>提示：</strong>如果文件较多，建议使用打包下载功能。</p>
        </div>
        
        <ul class="file-list">
          ${files.map((file, index) => {
            const fileId = file.id;
            const shortId = fileId.split('/').pop() || fileId;
            const fileName = fileNames[fileId] || `file_${index + 1}.bin`;
            const fileUrl = file.url || (file.image ? file.image.url : '#');
            const fileSize = file.originalFileSize ? 
              (file.originalFileSize > 1024 * 1024 ? 
                `${(file.originalFileSize / (1024 * 1024)).toFixed(2)} MB` : 
                `${Math.round(file.originalFileSize / 1024)} KB`) : '未知大小';
            
            return `
            <li class="file-item">
              <div class="file-info">
                <div class="file-name">${fileName}</div>
                <div>
                  <span class="file-id">ID: ${shortId}</span>
                  <span class="file-size">${fileSize}</span>
                </div>
              </div>
              ${fileUrl && fileUrl !== '#' ? 
                `<a href="${fileUrl}" class="download-btn" download="${fileName}">下载</a>` : 
                `<button class="download-btn" style="background: #95a5a6; cursor: not-allowed;" disabled>不可用</button>`
              }
            </li>
            `;
          }).join('')}
        </ul>
        
        <button class="download-all-btn" onclick="downloadAllFiles()">
          📦 打包下载所有文件 (${files.length}个)
        </button>
      </div>
      
      <script>
        function downloadAllFiles() {
          // 收集所有可用的文件URL
          const downloadLinks = document.querySelectorAll('.download-btn:not([disabled])');
          if (downloadLinks.length === 0) {
            alert('没有可用的文件下载链接');
            return;
          }
          
          // 显示下载提示
          alert('开始打包下载，请稍候...');
          
          // 对于Shopify文件，我们无法直接打包，所以让用户逐个下载
          // 或者我们可以重定向到我们的打包API，但需要文件ID
          // 这里我们使用一个简单的方案：逐个打开下载链接
          let delay = 0;
          downloadLinks.forEach((link, index) => {
            setTimeout(() => {
              window.open(link.href, '_blank');
            }, delay);
            delay += 1000; // 每个文件间隔1秒下载，避免浏览器限制
          });
          
          alert('已经开始下载，请检查浏览器下载列表。如果浏览器阻止了弹窗，请允许弹窗后重试。');
        }
        
        // 自动为可用文件添加点击统计（可选）
        document.addEventListener('DOMContentLoaded', function() {
          const downloadBtns = document.querySelectorAll('.download-btn:not([disabled])');
          downloadBtns.forEach(btn => {
            btn.addEventListener('click', function() {
              console.log('下载文件:', this.download);
            });
          });
        });
      </script>
    </body>
    </html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Shopify多文件下载处理失败:', error);
    return res.status(500).json({
      error: '多文件下载处理失败',
      message: error.message
    });
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, shopifyFileId, fileName, shopifyFileIds } = req.query;
    
    // 如果提供了shopifyFileIds，则处理Shopify多文件下载
    if (shopifyFileIds) {
      let fileIds = [];
      let fileNames = {};
      
      if (Array.isArray(shopifyFileIds)) {
        fileIds = shopifyFileIds;
      } else if (typeof shopifyFileIds === 'string' && shopifyFileIds.includes(',')) {
        fileIds = shopifyFileIds.split(',').map(id => id.trim());
      } else {
        fileIds = [shopifyFileIds];
      }
      
      // 处理文件名映射
      if (fileName) {
        if (Array.isArray(fileName)) {
          fileIds.forEach((fileId, index) => {
            if (fileName[index]) {
              fileNames[fileId] = fileName[index];
            }
          });
        } else if (typeof fileName === 'string' && fileName.includes(',')) {
          const names = fileName.split(',');
          fileIds.forEach((fileId, index) => {
            if (names[index]) {
              fileNames[fileId] = names[index].trim();
            }
          });
        } else if (typeof fileName === 'string') {
          fileNames[fileIds[0]] = fileName;
        }
      }
      
      return await handleShopifyMultipleFilesDownload(req, res, fileIds, fileNames);
    }
    
    // 如果提供了shopifyFileId，则通过Shopify Files下载（单个文件）
    if (shopifyFileId) {
      return await handleShopifyFileDownload(req, res, shopifyFileId, fileName);
    }
    
    if (!id) {
      return res.status(400).json({ error: 'Missing file ID' });
    }

    // 解析文件ID参数
    let fileIds = [];
    let requestedFileNames = {};
    
    if (Array.isArray(id)) {
      // 多个ID：id[]=file1&id[]=file2
      fileIds = id;
      
      // 如果有对应的文件名参数
      if (Array.isArray(fileName)) {
        fileIds.forEach((fileId, index) => {
          if (fileName[index]) {
            requestedFileNames[fileId] = fileName[index];
          }
        });
      }
    } else if (typeof id === 'string') {
      // 单个ID：id=file1
      if (id.includes(',')) {
        // 逗号分隔的多个ID：id=file1,file2,file3
        fileIds = id.split(',').map(id => id.trim()).filter(id => id);
        
        // 如果有逗号分隔的文件名
        if (fileName && typeof fileName === 'string' && fileName.includes(',')) {
          const names = fileName.split(',');
          fileIds.forEach((fileId, index) => {
            if (names[index]) {
              requestedFileNames[fileId] = names[index].trim();
            }
          });
        }
      } else {
        // 单个ID
        fileIds = [id];
        if (fileName && typeof fileName === 'string') {
          requestedFileNames[id] = fileName;
        }
      }
    }

    // 验证文件ID
    if (fileIds.length === 0) {
      return res.status(400).json({ error: 'No valid file IDs provided' });
    }

    console.log('处理的文件IDs:', fileIds, '数量:', fileIds.length);

    // 特殊处理占位符文件
    if (fileIds.length === 1 && fileIds[0] === 'placeholder') {
      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>文件上传失败</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
          .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
          h1 { color: #e67e22; font-size: 22px; margin: 0 0 12px; }
          p { color: #555; line-height: 1.7; margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚠️ 文件上传失败</h1>
          <p>文件ID：<code>placeholder</code></p>
          <p>此文件在上传过程中失败，无法下载。请联系客户重新上传文件。</p>
        </div>
      </body>
      </html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }

    // 查询文件记录
    let fileRecords = [];
    try {
      fileRecords = await getMetaobjectRecords(fileIds);
    } catch (gqlErr) {
      console.error('GraphQL请求失败:', gqlErr);
      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>文件服务暂不可用</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
          .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
          h1 { color: #e67e22; font-size: 22px; margin: 0 0 12px; }
          p { color: #555; line-height: 1.7; margin: 8px 0; }
          code { background: #f2f2f2; padding: 4px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚠️ 文件服务暂不可用</h1>
          <p>文件ID：<code>${fileIds.join(', ')}</code></p>
          <p>后台文件存储服务暂时不可用，请稍后重试，或联系客户重新提供文件。</p>
        </div>
      </body>
      </html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(503).send(html);
    }

    // 检查找到的文件记录
    if (fileRecords.length === 0) {
      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>文件不存在</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
          .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
          h1 { color: #e67e22; font-size: 22px; margin: 0 0 12px; }
          p { color: #555; line-height: 1.7; margin: 8px 0; }
          code { background: #f2f2f2; padding: 4px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>⚠️ 文件不存在</h1>
          <p>请求的文件ID：<code>${fileIds.join(', ')}</code></p>
          <p>未找到对应的文件记录。请确认文件ID是否正确。</p>
        </div>
      </body>
      </html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }

    console.log(`找到 ${fileRecords.length}/${fileIds.length} 个文件记录`);

    // 智能判断：单个文件直接下载，多个文件打包下载
    if (fileRecords.length === 1) {
      console.log('单个文件，直接下载');
      return await handleSingleFileDownload(res, fileRecords[0], requestedFileNames[fileRecords[0].id]);
    } else {
      console.log(`${fileRecords.length}个文件，打包下载`);
      return await handleMultipleFilesDownload(res, fileRecords, requestedFileNames);
    }

  } catch (error) {
    console.error('文件下载错误:', error);
    
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>服务器错误</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 680px; margin: 40px auto; background: #f7f7f7; padding: 20px; }
        .card { background: #fff; padding: 28px 32px; border-radius: 10px; box-shadow: 0 3px 16px rgba(0,0,0,.08); }
        h1 { color: #e74c3c; font-size: 22px; margin: 0 0 12px; }
        p { color: #555; line-height: 1.7; margin: 8px 0; }
        pre { background: #f2f2f2; padding: 12px; border-radius: 4px; overflow: auto; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🚨 服务器错误</h1>
        <p>文件下载过程中发生意外错误。</p>
        <p>错误信息：</p>
        <pre>${error.message}</pre>
        <p>请稍后重试，或联系技术支持。</p>
      </div>
    </body>
    </html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(html);
  }
}
