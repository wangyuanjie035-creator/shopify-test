/**
 * 文件存储管理器
 * 基于浏览器本地存储的文件管理解决方案
 */

class FileStorageManager {
  constructor() {
    this.storageKey = 'uploaded_files';
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
    this.allowedTypes = [
      'application/step',
      'application/stp',
      'application/octet-stream',
      'model/stl',
      'application/3mf',
      'application/iges',
      'application/dwg',
      'application/dxf',
      'application/pdf'
    ];
  }

  /**
   * 上传文件到存储
   * @param {File} file - 要上传的文件
   * @param {string} fileId - 文件ID
   * @returns {Promise<string>} 文件URL
   */
  async uploadFile(file, fileId) {
    try {
      // 验证文件
      if (!this.validateFile(file)) {
        throw new Error('文件类型不支持或文件过大');
      }

      // 生成文件URL
      const fileUrl = await this.generateFileUrl(file, fileId);
      
      // 保存文件信息到本地存储
      this.saveFileInfo(fileId, {
        name: file.name,
        size: file.size,
        type: file.type,
        url: fileUrl,
        uploadTime: new Date().toISOString(),
        fileId: fileId
      });

      return fileUrl;
    } catch (error) {
      console.error('文件上传失败:', error);
      throw error;
    }
  }

  /**
   * 验证文件
   * @param {File} file - 文件对象
   * @returns {boolean} 是否有效
   */
  validateFile(file) {
    if (!file) return false;
    if (file.size > this.maxFileSize) return false;
    
    const extension = file.name.split('.').pop().toLowerCase();
    const validExtensions = ['stl', 'obj', 'step', 'stp', '3mf', 'iges', 'dwg', 'dxf', 'pdf'];
    
    return validExtensions.includes(extension);
  }

  /**
   * 生成文件URL
   * @param {File} file - 文件对象
   * @param {string} fileId - 文件ID
   * @returns {Promise<string>} 文件URL
   */
  async generateFileUrl(file, fileId) {
    try {
      // 使用FileReader生成Data URL
      const dataUrl = await this.fileToDataUrl(file);
      return dataUrl;
    } catch (error) {
      console.error('生成文件URL失败:', error);
      throw error;
    }
  }

  /**
   * 将文件转换为Data URL
   * @param {File} file - 文件对象
   * @returns {Promise<string>} Data URL
   */
  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * 保存文件信息到本地存储
   * @param {string} fileId - 文件ID
   * @param {Object} fileInfo - 文件信息
   */
  saveFileInfo(fileId, fileInfo) {
    try {
      const files = this.getStoredFiles();
      files[fileId] = fileInfo;
      localStorage.setItem(this.storageKey, JSON.stringify(files));
    } catch (error) {
      console.error('保存文件信息失败:', error);
    }
  }

  /**
   * 获取存储的文件信息
   * @returns {Object} 文件信息对象
   */
  getStoredFiles() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('获取存储文件失败:', error);
      return {};
    }
  }

  /**
   * 获取文件信息
   * @param {string} fileId - 文件ID
   * @returns {Object|null} 文件信息
   */
  getFileInfo(fileId) {
    const files = this.getStoredFiles();
    return files[fileId] || null;
  }

  /**
   * 下载文件
   * @param {string} fileUrl - 文件URL
   * @param {string} fileName - 文件名
   */
  downloadFile(fileUrl, fileName) {
    try {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('下载文件失败:', error);
      throw error;
    }
  }

  /**
   * 删除文件
   * @param {string} fileId - 文件ID
   */
  deleteFile(fileId) {
    try {
      const files = this.getStoredFiles();
      delete files[fileId];
      localStorage.setItem(this.storageKey, JSON.stringify(files));
    } catch (error) {
      console.error('删除文件失败:', error);
    }
  }

  /**
   * 清理过期文件（超过30天）
   */
  cleanupExpiredFiles() {
    try {
      const files = this.getStoredFiles();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      Object.keys(files).forEach(fileId => {
        const fileInfo = files[fileId];
        if (fileInfo.uploadTime) {
          const uploadDate = new Date(fileInfo.uploadTime);
          if (uploadDate < thirtyDaysAgo) {
            delete files[fileId];
          }
        }
      });

      localStorage.setItem(this.storageKey, JSON.stringify(files));
    } catch (error) {
      console.error('清理过期文件失败:', error);
    }
  }
}

// 创建全局实例
window.fileStorageManager = new FileStorageManager();

// 页面加载时清理过期文件
document.addEventListener('DOMContentLoaded', () => {
  window.fileStorageManager.cleanupExpiredFiles();
});