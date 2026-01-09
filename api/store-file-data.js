// 导出文件存储函数供其他API使用
export async function storeFileData({ draftOrderId, fileData, fileName }) {
  try {
    // 使用全局变量存储文件数据
    if (!global.fileStorage) {
      global.fileStorage = new Map();
    }

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    global.fileStorage.set(fileId, {
      draftOrderId,
      fileName,
      fileData,
      uploadTime: new Date().toISOString()
    });

    console.log('✅ 文件数据存储成功:', { fileId, fileName, draftOrderId });

    return {
      success: true,
      message: '文件数据存储成功',
      fileId,
      fileName,
      draftOrderId,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ 文件存储失败:', error);
    return {
      success: false,
      message: '文件存储失败',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

import { setCorsHeaders, HttpStatus } from './_lib.js';

export default async function handler(req, res) {
  // 设置CORS头
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(HttpStatus.NO_CONTENT).end();
  }

  try {
    if (req.method !== 'POST') {
      return res.status(HttpStatus.METHOD_NOT_ALLOWED).json({ success: false, message: 'Method not allowed' });
    }

    const { draftOrderId, fileData, fileName } = req.body;

    if (!draftOrderId || !fileData || !fileName) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Missing required parameters: draftOrderId, fileData, fileName'
      });
    }

    // 使用导出的存储函数
    const result = await storeFileData({ draftOrderId, fileData, fileName });
    
    if (result.success) {
      return res.status(HttpStatus.OK).json(result);
    } else {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(result);
    }

  } catch (error) {
    console.error('❌ 文件存储失败:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '文件存储失败',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
