// Vercel 文件下载 API
// 用于下载已上传的文件
const FILE_METAOBJECT_TYPE = 'uploaded_file';

import { setCorsHeaders, shopifyClient, HttpStatus, ErrorCodes } from './_lib.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }

  if (req.method !== 'GET') {
    return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({ error: 'Method not allowed' });
  }

  try {
    const { id, shopifyFileId, fileName: requestedFileName } = req.query;
    
    // 如果提供了shopifyFileId，则通过Shopify Files下载
    if (shopifyFileId) {
      return await handleShopifyFileDownload(req, res, shopifyFileId, requestedFileName);
    }
    
    if (!id) {
      return res.status(400).json({ error: 'Missing file ID' });
    }

    // 优先按 handle 精确查询 uploaded_file
    const handleQuery = `
      query($handle: String!, $type: String!) {
        metaobjectByHandle(handle: $handle, type: $type) {
          id
          fields { key value }
        }
      }
    `;

    let fileRecord = null;
    try {
      if (shopifyClient.isConfigured()) {
        const handleResult = await shopifyClient.query(handleQuery, { handle: id, type: FILE_METAOBJECT_TYPE });
        fileRecord = handleResult?.data?.metaobjectByHandle || null;
      }
    } catch (err) {
      console.warn('按 handle 查询 uploaded_file 失败，尝试列表查询:', err.message);
    }

    // 未找到时降级列表查询（最多100条）
    if (!fileRecord && shopifyClient.isConfigured()) {
      const listQuery = `
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
      try {
        const result = await shopifyClient.query(listQuery, { type: FILE_METAOBJECT_TYPE, first: 100 });
        if (result?.errors) {
          console.error('GraphQL errors:', result.errors);
        }
        const nodes = result?.data?.metaobjects?.nodes || [];
        fileRecord = nodes.find(node => {
          const f = node.fields.find(x => x.key === 'file_id');
          return f && f.value === id;
        }) || null;
      } catch (gqlErr) {
        console.error('GraphQL request failed:', gqlErr);
      }
    }

    if (!fileRecord) {
      // 特殊处理本地存储或占位符
      if (id.startsWith('file_')) {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件不存在</title></head><body>未找到文件：${id}</body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(HttpStatus.NOT_FOUND).send(html);
      }
      if (id === 'placeholder') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件上传失败</title></head><body>文件上传失败，ID：${id}</body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(HttpStatus.NOT_FOUND).send(html);
      }
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件不存在</title></head><body>文件不存在：${id}</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(HttpStatus.NOT_FOUND).send(html);
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
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(html);
    }

    const buffer = Buffer.from(fileData, 'base64');
    res.setHeader('Content-Type', fileType);
    // 使用 RFC 5987 编码处理包含非 ASCII 字符的文件名
    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Length', buffer.length);
    return res.status(HttpStatus.OK).send(buffer);

  } catch (error) {
    console.error('文件下载错误:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      error: '文件下载失败', 
      details: error.message 
    });
  }
}

// 处理Shopify文件下载
async function handleShopifyFileDownload(req, res, shopifyFileId, fileName) {
  try {
    console.log('开始下载Shopify文件:', { shopifyFileId, fileName });

    if (!shopifyClient.isConfigured()) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Shopify 配置缺失',
        message: '请配置 Shopify 环境变量'
      });
    }

    // 使用 node 查询文件，兼容不同版本 API
    const query = `
      query($id: ID!) {
        node(id: $id) {
          ... on GenericFile {
            url
            originalFileSize
          }
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    `;

    const result = await shopifyClient.query(query, { id: shopifyFileId });

    if (!result.data || !result.data.node) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: '文件未找到' });
    }

    const file = result.data.node;
    let fileUrl = null;

    // 获取文件URL
    if (file.url) {
      fileUrl = file.url;
    } else if (file.image && file.image.url) {
      fileUrl = file.image.url;
    }

    if (!fileUrl) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: '文件URL不可用' });
    }

    console.log('文件URL获取成功:', fileUrl);

    // 直接重定向到 Shopify CDN URL（不设置 Content-Disposition，让 CDN 处理）
    // 因为重定向后浏览器会跟随到 CDN，我们的头会被覆盖
    res.writeHead(302, { Location: fileUrl });
    return res.end();

  } catch (error) {
    console.error('Shopify文件下载失败:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: '文件下载失败',
      message: error.message
    });
  }
}
