/**
 * 统一登录管理系统
 * 管理客户登录和管理员登录的互斥机制
 */

class LoginManager {
  constructor() {
    this.customerSessionKey = 'customerSession';
    this.adminSessionKey = 'adminSession';
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24小时
  }

  /**
   * 检查是否有活跃的登录会话
   * @returns {Object} 登录状态信息
   */
  checkLoginStatus() {
    const customerSession = this.getCustomerSession();
    const adminSession = this.getAdminSession();

    return {
      isLoggedIn: !!(customerSession || adminSession),
      isCustomer: !!customerSession,
      isAdmin: !!adminSession,
      customerSession: customerSession,
      adminSession: adminSession
    };
  }

  /**
   * 客户登录
   * @param {Object} customerData - 客户数据
   * @returns {boolean} 登录是否成功
   */
  customerLogin(customerData) {
    // 检查是否已有管理员登录
    if (this.getAdminSession()) {
      console.warn('管理员已登录，无法进行客户登录');
      return false;
    }

    try {
      const session = {
        ...customerData,
        loginTime: new Date().toISOString(),
        type: 'customer'
      };

      localStorage.setItem(this.customerSessionKey, JSON.stringify(session));
      this.clearAdminSession(); // 清除管理员会话
      
      console.log('客户登录成功:', customerData);
      return true;
    } catch (error) {
      console.error('客户登录失败:', error);
      return false;
    }
  }

  /**
   * 管理员登录
   * @param {Object} adminData - 管理员数据
   * @returns {boolean} 登录是否成功
   */
  adminLogin(adminData) {
    // 检查是否已有客户登录
    if (this.getCustomerSession()) {
      console.warn('客户已登录，无法进行管理员登录');
      return false;
    }

    try {
      const session = {
        ...adminData,
        loginTime: new Date().toISOString(),
        type: 'admin'
      };

      localStorage.setItem(this.adminSessionKey, JSON.stringify(session));
      this.clearCustomerSession(); // 清除客户会话
      
      console.log('管理员登录成功:', adminData);
      return true;
    } catch (error) {
      console.error('管理员登录失败:', error);
      return false;
    }
  }

  /**
   * 获取客户会话
   * @returns {Object|null} 客户会话数据
   */
  getCustomerSession() {
    try {
      const session = localStorage.getItem(this.customerSessionKey);
      if (!session) return null;

      const sessionData = JSON.parse(session);
      
      // 检查会话是否过期
      if (this.isSessionExpired(sessionData.loginTime)) {
        this.clearCustomerSession();
        return null;
      }

      return sessionData;
    } catch (error) {
      console.error('获取客户会话失败:', error);
      this.clearCustomerSession();
      return null;
    }
  }

  /**
   * 获取管理员会话
   * @returns {Object|null} 管理员会话数据
   */
  getAdminSession() {
    try {
      const session = localStorage.getItem(this.adminSessionKey);
      if (!session) return null;

      const sessionData = JSON.parse(session);
      
      // 检查会话是否过期
      if (this.isSessionExpired(sessionData.loginTime)) {
        this.clearAdminSession();
        return null;
      }

      return sessionData;
    } catch (error) {
      console.error('获取管理员会话失败:', error);
      this.clearAdminSession();
      return null;
    }
  }

  /**
   * 检查会话是否过期
   * @param {string} loginTime - 登录时间
   * @returns {boolean} 是否过期
   */
  isSessionExpired(loginTime) {
    const login = new Date(loginTime);
    const now = new Date();
    return (now - login) > this.sessionTimeout;
  }

  /**
   * 清除客户会话
   */
  clearCustomerSession() {
    localStorage.removeItem(this.customerSessionKey);
  }

  /**
   * 清除管理员会话
   */
  clearAdminSession() {
    localStorage.removeItem(this.adminSessionKey);
  }

  /**
   * 退出登录
   */
  logout() {
    this.clearCustomerSession();
    this.clearAdminSession();
    console.log('已退出登录');
  }

  /**
   * 强制切换登录类型
   * @param {string} type - 登录类型 ('customer' 或 'admin')
   * @param {Object} data - 登录数据
   * @returns {boolean} 切换是否成功
   */
  switchLoginType(type, data) {
    this.logout(); // 清除所有会话
    
    if (type === 'customer') {
      return this.customerLogin(data);
    } else if (type === 'admin') {
      return this.adminLogin(data);
    }
    
    return false;
  }

  /**
   * 获取当前登录用户信息
   * @returns {Object|null} 用户信息
   */
  getCurrentUser() {
    const status = this.checkLoginStatus();
    
    if (status.isCustomer) {
      return {
        type: 'customer',
        data: status.customerSession
      };
    } else if (status.isAdmin) {
      return {
        type: 'admin',
        data: status.adminSession
      };
    }
    
    return null;
  }

  /**
   * 检查是否有权限访问管理员功能
   * @returns {boolean} 是否有权限
   */
  hasAdminAccess() {
    return this.checkLoginStatus().isAdmin;
  }

  /**
   * 检查是否有权限访问客户功能
   * @returns {boolean} 是否有权限
   */
  hasCustomerAccess() {
    return this.checkLoginStatus().isCustomer;
  }

  /**
   * 重定向到登录页面
   * @param {string} type - 登录类型
   */
  redirectToLogin(type = 'customer') {
    if (type === 'admin') {
      window.location.href = '/pages/admin-login';
    } else {
      // 重定向到客户登录页面或首页
      window.location.href = '/account/login';
    }
  }

  /**
   * 检查并重定向
   * @param {string} requiredType - 需要的登录类型
   * @returns {boolean} 是否有权限
   */
  checkAndRedirect(requiredType) {
    const status = this.checkLoginStatus();
    
    if (requiredType === 'admin' && !status.isAdmin) {
      this.redirectToLogin('admin');
      return false;
    } else if (requiredType === 'customer' && !status.isCustomer) {
      this.redirectToLogin('customer');
      return false;
    }
    
    return true;
  }
}

// 创建全局实例
window.loginManager = new LoginManager();

// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', function() {
  const status = window.loginManager.checkLoginStatus();
  
  if (status.isLoggedIn) {
    console.log('当前登录状态:', status.isCustomer ? '客户' : '管理员');
  } else {
    console.log('未登录');
  }
});
