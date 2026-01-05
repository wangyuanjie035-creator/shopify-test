// Vercel 文件下载 API
// 用于下载已上传的文件
const FILE_METAOBJECT_TYPE = 'uploaded_file';

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

import { setCorsHeaders } from '../utils/cors-config.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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
      const handleResult = await shopGql(handleQuery, { handle: id, type: FILE_METAOBJECT_TYPE });
      fileRecord = handleResult?.data?.metaobjectByHandle || null;
    } catch (err) {
      console.warn('按 handle 查询 uploaded_file 失败，尝试列表查询:', err.message);
    }

    // 未找到时降级列表查询（最多100条）
    if (!fileRecord) {
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
        const result = await shopGql(listQuery, { type: FILE_METAOBJECT_TYPE, first: 100 });
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
        return res.status(404).send(html);
      }
      if (id === 'placeholder') {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文件上传失败</title></head><body>文件上传失败，ID：${id}</body></html>`;
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

// 处理Shopify文件下载
async function handleShopifyFileDownload(req, res, shopifyFileId, fileName) {
  try {
    console.log('开始下载Shopify文件:', { shopifyFileId, fileName });

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

    const result = await shopGql(query, { id: shopifyFileId });

    if (result.errors && result.errors.length > 0) {
      console.error('Shopify文件查询错误:', result.errors);
      return res.status(500).json({ error: '文件查询失败', message: result.errors[0].message });
    }

    if (!result.data || !result.data.node) {
      return res.status(404).json({ error: '文件未找到' });
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
      return res.status(404).json({ error: '文件URL不可用' });
    }

    console.log('文件URL获取成功:', fileUrl);

    // 设置下载头并重定向到文件URL
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
