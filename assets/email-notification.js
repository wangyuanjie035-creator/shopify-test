/**
 * 邮件通知系统
 * 当客户提交询价后，自动发送邮件通知客服
 */

class EmailNotificationSystem {
  constructor() {
    this.adminEmails = [
      'admin@example.com',  // 替换为实际的客服邮箱
      'service@example.com'
    ];
    this.notificationEnabled = true;
  }

  /**
   * 发送询价通知邮件
   * @param {Object} orderData - 订单数据
   */
  async sendQuoteNotification(orderData) {
    if (!this.notificationEnabled) {
      console.log('邮件通知已禁用');
      return;
    }

    try {
      const emailData = {
        to: this.adminEmails,
        subject: `新询价请求 - ${orderData.customer} - ${orderData.files}`,
        body: this.generateEmailBody(orderData),
        orderData: orderData
      };

      // 方法1：使用Webhook发送邮件
      await this.sendViaWebhook(emailData);
      
      // 方法2：使用浏览器邮件客户端
      this.openEmailClient(emailData);
      
      console.log('询价通知已发送');
    } catch (error) {
      console.error('发送邮件通知失败:', error);
    }
  }

  /**
   * 生成邮件内容
   * @param {Object} orderData - 订单数据
   * @returns {string} 邮件内容
   */
  generateEmailBody(orderData) {
    return `
新询价请求通知

客户信息：
- 姓名：${orderData.customer}
- 邮箱：${orderData.email}
- 电话：${orderData.phone || '未提供'}

文件信息：
- 文件名：${orderData.files}
- 文件类型：${orderData.fileType || '3D模型'}
- 上传时间：${orderData.uploadTime}

订单参数：
- 数量：${orderData.quantity || 1}
- 材料：${orderData.material || '未指定'}
- 精度等级：${orderData.precision || '未指定'}
- 表面处理：${orderData.finish || '未指定'}
- 缩放比例：${orderData.scale || 100}%
- 备注：${orderData.note || '无'}

订单ID：${orderData.uuid}
状态：待报价

请及时处理此询价请求。

---
此邮件由系统自动发送，请勿回复。
    `.trim();
  }

  /**
   * 通过Webhook发送邮件
   * @param {Object} emailData - 邮件数据
   */
  async sendViaWebhook(emailData) {
    try {
      // 这里可以集成第三方邮件服务，如SendGrid、Mailgun等
      const webhookUrl = '/apps/email-notification/send';
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        throw new Error('Webhook发送失败');
      }
    } catch (error) {
      console.log('Webhook发送失败，使用备用方案:', error);
    }
  }

  /**
   * 打开邮件客户端
   * @param {Object} emailData - 邮件数据
   */
  openEmailClient(emailData) {
    const mailtoUrl = this.generateMailtoUrl(emailData);
    
    // 创建隐藏的链接并点击
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.target = '_blank';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * 生成mailto URL
   * @param {Object} emailData - 邮件数据
   * @returns {string} mailto URL
   */
  generateMailtoUrl(emailData) {
    const to = emailData.to.join(',');
    const subject = encodeURIComponent(emailData.subject);
    const body = encodeURIComponent(emailData.body);
    
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }

  /**
   * 发送内部通知（存储到本地）
   * @param {Object} orderData - 订单数据
   */
  sendInternalNotification(orderData) {
    try {
      const notifications = this.getStoredNotifications();
      const notification = {
        id: orderData.uuid,
        type: 'quote_request',
        customer: orderData.customer,
        files: orderData.files,
        time: new Date().toISOString(),
        status: 'unread',
        orderData: orderData
      };
      
      notifications.unshift(notification);
      
      // 只保留最近100条通知
      if (notifications.length > 100) {
        notifications.splice(100);
      }
      
      localStorage.setItem('adminNotifications', JSON.stringify(notifications));
      
      // 触发通知事件
      this.triggerNotificationEvent(notification);
      
    } catch (error) {
      console.error('发送内部通知失败:', error);
    }
  }

  /**
   * 获取存储的通知
   * @returns {Array} 通知列表
   */
  getStoredNotifications() {
    try {
      const stored = localStorage.getItem('adminNotifications');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('获取通知失败:', error);
      return [];
    }
  }

  /**
   * 触发通知事件
   * @param {Object} notification - 通知数据
   */
  triggerNotificationEvent(notification) {
    // 触发自定义事件，供其他组件监听
    const event = new CustomEvent('newQuoteNotification', {
      detail: notification
    });
    window.dispatchEvent(event);
  }

  /**
   * 标记通知为已读
   * @param {string} notificationId - 通知ID
   */
  markAsRead(notificationId) {
    try {
      const notifications = this.getStoredNotifications();
      const notification = notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.status = 'read';
        localStorage.setItem('adminNotifications', JSON.stringify(notifications));
      }
    } catch (error) {
      console.error('标记通知失败:', error);
    }
  }

  /**
   * 获取未读通知数量
   * @returns {number} 未读通知数量
   */
  getUnreadCount() {
    const notifications = this.getStoredNotifications();
    return notifications.filter(n => n.status === 'unread').length;
  }
}

// 创建全局实例
window.emailNotificationSystem = new EmailNotificationSystem();

// 监听新询价通知事件
window.addEventListener('newQuoteNotification', function(event) {
  console.log('收到新询价通知:', event.detail);
  
  // 可以在这里添加其他通知处理逻辑
  // 比如显示浏览器通知、更新UI等
  if (Notification.permission === 'granted') {
    new Notification('新询价请求', {
      body: `${event.detail.customer} 提交了新的询价请求`,
      icon: '/favicon.ico'
    });
  }
});

// 请求通知权限
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}
