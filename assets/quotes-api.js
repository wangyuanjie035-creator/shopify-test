/**
 * Shopify Quotes API Client
 * 直接在 Shopify 服务器上运行的 Quotes API
 */

class QuotesAPI {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl || window.location.origin;
    // 优先使用 App Proxy，回退到页面端点
    this.apiEndpoint = '/apps/quotes-api';
    this.fallbackEndpoint = '/pages/quotes-api';
  }

  /**
   * 获取所有 quotes
   * @returns {Promise<Object>} 包含 records 数组的对象
   */
  async getAllQuotes() {
    try {
      // 首先尝试 App Proxy 端点
      let response = await this.makeRequest(this.apiEndpoint, 'GET');
      
      // 如果 App Proxy 失败，尝试页面端点
      if (!response.ok && this.fallbackEndpoint) {
        console.warn('App Proxy failed, trying fallback endpoint');
        response = await this.makeRequest(this.fallbackEndpoint, 'GET');
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching quotes:', error);
      throw error;
    }
  }

  /**
   * 发送HTTP请求
   * @param {string} endpoint - API端点
   * @param {string} method - HTTP方法
   * @param {Object} body - 请求体（可选）
   * @returns {Promise<Response>} 响应对象
   */
  async makeRequest(endpoint, method, body = null) {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return await fetch(`${this.baseUrl}${endpoint}`, options);
  }

  /**
   * 获取特定 quote
   * @param {string} id - Quote ID
   * @returns {Promise<Object>} Quote 对象
   */
  async getQuote(id) {
    try {
      let response = await this.makeRequest(`${this.apiEndpoint}/${id}`, 'GET');
      
      if (!response.ok && this.fallbackEndpoint) {
        response = await this.makeRequest(`${this.fallbackEndpoint}/${id}`, 'GET');
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching quote:', error);
      throw error;
    }
  }

  /**
   * 添加新 quote
   * @param {Object} quote - Quote 对象
   * @returns {Promise<Object>} 创建的 Quote 对象
   */
  async createQuote(quote) {
    try {
      let response = await this.makeRequest(this.apiEndpoint, 'POST', quote);
      
      if (!response.ok && this.fallbackEndpoint) {
        response = await this.makeRequest(this.fallbackEndpoint, 'POST', quote);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error creating quote:', error);
      throw error;
    }
  }

  /**
   * 更新 quote
   * @param {string} id - Quote ID
   * @param {Object} quote - 更新的 Quote 对象
   * @returns {Promise<Object>} 更新的 Quote 对象
   */
  async updateQuote(id, quote) {
    try {
      let response = await this.makeRequest(`${this.apiEndpoint}/${id}`, 'PUT', quote);
      
      if (!response.ok && this.fallbackEndpoint) {
        response = await this.makeRequest(`${this.fallbackEndpoint}/${id}`, 'PUT', quote);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating quote:', error);
      throw error;
    }
  }

  /**
   * 删除 quote
   * @param {string} id - Quote ID
   * @returns {Promise<Object>} 删除确认消息
   */
  async deleteQuote(id) {
    try {
      let response = await this.makeRequest(`${this.apiEndpoint}/${id}`, 'DELETE');
      
      if (!response.ok && this.fallbackEndpoint) {
        response = await this.makeRequest(`${this.fallbackEndpoint}/${id}`, 'DELETE');
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error deleting quote:', error);
      throw error;
    }
  }
}

// 创建全局实例
window.quotesAPI = new QuotesAPI();

// 导出类（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuotesAPI;
}
