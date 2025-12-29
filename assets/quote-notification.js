/**
 * 实时报价通知系统
 * 让客户能够实时看到报价更新
 */

class QuoteNotificationSystem {
  constructor() {
    this.checkInterval = null;
    this.lastCheckTime = null;
    this.isCustomerPage = this.detectCustomerPage();
    this.init();
  }

  // 检测是否在客户页面
  detectCustomerPage() {
    const path = window.location.pathname;
    return path.includes('/cart') || path.includes('/quote') || path.includes('/pages/');
  }

  // 初始化系统
  init() {
    if (!this.isCustomerPage) return;

    console.log('🔄 实时报价通知系统已启动');
    this.startPolling();
    this.addNotificationUI();
  }

  // 开始轮询检查
  startPolling() {
    // 每30秒检查一次
    this.checkInterval = setInterval(() => {
      this.checkQuoteUpdates();
    }, 30000);

    // 立即检查一次
    this.checkQuoteUpdates();
  }

  // 检查报价更新
  async checkQuoteUpdates() {
    try {
      console.log('🔍 检查报价更新...');
      
      // 获取购物车中的询价项目
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      
      const quoteItems = cart.items.filter(item => 
        item.properties && item.properties['Order Type'] === '3D Model Quote'
      );

      if (quoteItems.length === 0) {
        console.log('📋 购物车中没有询价项目');
        return;
      }

      // 检查每个询价项目的状态
      for (const item of quoteItems) {
        await this.checkItemQuoteStatus(item);
      }

    } catch (error) {
      console.error('❌ 检查报价更新失败:', error);
    }
  }

  // 检查单个项目的报价状态
  async checkItemQuoteStatus(cartItem) {
    try {
      const uuid = cartItem.properties._uuid;
      if (!uuid) return;

      // 从后端获取最新报价状态
      console.log('🔍 检查报价状态，UUID:', uuid);
      const response = await fetch(`https://shopify-13s4.vercel.app/api/quotes?handle=${encodeURIComponent(uuid)}`);
      
      if (!response.ok) {
        console.warn('⚠️ 无法获取报价状态:', uuid, '状态码:', response.status);
        return;
      }

      const quoteData = await response.json();
      console.log('📊 报价数据:', quoteData);
      
      if (quoteData && quoteData.fields) {
        const fields = quoteData.fields.reduce((acc, field) => {
          acc[field.key] = field.value;
          return acc;
        }, {});

        const status = fields.status;
        const price = fields.price;

        console.log('📊 报价状态:', { uuid, status, price });

        // 如果状态是 "Quoted" 且有价格，更新购物车显示
        if (status === 'Quoted' && price) {
          this.updateCartItemDisplay(cartItem, price, fields);
          this.showQuoteNotification(uuid, price, fields);
        }
      }

    } catch (error) {
      console.error('❌ 检查项目报价状态失败:', error);
    }
  }

  // 更新购物车项目显示
  async updateCartItemDisplay(cartItem, price, quoteFields) {
    try {
      // 1. 更新 Shopify 购物车中的实际价格
      await this.updateCartItemPrice(cartItem, price);
      
      // 2. 查找页面中的对应元素
      const itemElement = this.findCartItemElement(cartItem);
      
      if (itemElement) {
        // 更新状态显示
        const statusElement = itemElement.querySelector('.quote-status, .status-badge');
        if (statusElement) {
          statusElement.textContent = '报价已完成';
          statusElement.className = 'quote-status quoted';
          statusElement.style.backgroundColor = '#4caf50';
          statusElement.style.color = 'white';
        }

        // 更新价格显示
        const priceElement = itemElement.querySelector('.quote-price, .price-display');
        if (priceElement) {
          priceElement.textContent = `¥${price}`;
          priceElement.style.fontWeight = 'bold';
          priceElement.style.color = '#e91e63';
        }

        // 添加报价完成标记
        this.addQuoteCompletedBadge(itemElement, price, quoteFields);

        console.log('✅ 购物车显示和价格已更新');
      }

    } catch (error) {
      console.error('❌ 更新购物车显示失败:', error);
    }
  }

  // 更新购物车中的实际价格
  async updateCartItemPrice(cartItem, newPrice) {
    try {
      console.log('💰 更新购物车项目价格:', cartItem.key, '新价格:', newPrice);
      
      // 将价格从元转换为分（Shopify 使用分作为单位）
      const priceInCents = Math.round(parseFloat(newPrice) * 100);
      
      // 使用 Shopify Cart API 更新价格
      const response = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: cartItem.key,
          quantity: cartItem.quantity,
          properties: {
            ...cartItem.properties,
            'Quote Status': 'Quoted',
            'Quoted Price': newPrice,
            'Quote Completed': 'true',
            'Quote Date': new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        const updatedCart = await response.json();
        console.log('✅ 购物车价格更新成功');
        
        // 刷新页面以显示新价格
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        
        return updatedCart;
      } else {
        console.warn('⚠️ 购物车价格更新失败:', response.status);
      }

    } catch (error) {
      console.error('❌ 更新购物车价格失败:', error);
    }
  }

  // 查找购物车项目元素
  findCartItemElement(cartItem) {
    // 尝试多种选择器
    const selectors = [
      `[data-cart-item-key="${cartItem.key}"]`,
      `[data-uuid="${cartItem.properties._uuid}"]`,
      '.cart-item',
      '.quote-item',
      '.cart__item'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    // 如果找不到，尝试通过文本内容匹配
    const fileName = cartItem.properties['零件名称'] || cartItem.properties['文件名称'];
    if (fileName) {
      const elements = document.querySelectorAll('.cart-item, .quote-item, .cart__item');
      for (const element of elements) {
        if (element.textContent.includes(fileName)) {
          return element;
        }
      }
    }

    return null;
  }

  // 添加报价完成标记
  addQuoteCompletedBadge(element, price, quoteFields) {
    const badge = document.createElement('div');
    badge.className = 'quote-completed-badge';
    badge.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: linear-gradient(45deg, #4caf50, #8bc34a);
      color: white;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
      z-index: 10;
      animation: pulse 2s infinite;
    `;
    
    badge.innerHTML = `
      <div>✅ 报价完成</div>
      <div style="font-size: 14px; margin-top: 2px;">¥${price}</div>
    `;

    // 添加动画样式
    if (!document.getElementById('quote-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'quote-animation-styles';
      style.textContent = `
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    element.style.position = 'relative';
    element.appendChild(badge);

    // 5秒后移除动画
    setTimeout(() => {
      badge.style.animation = 'none';
    }, 5000);
  }

  // 显示报价通知
  showQuoteNotification(uuid, price, quoteFields) {
    const notification = document.createElement('div');
    notification.className = 'quote-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4caf50, #8bc34a);
      color: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(76, 175, 80, 0.3);
      z-index: 10000;
      max-width: 350px;
      animation: slideInRight 0.5s ease-out;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 24px; margin-right: 12px;">🎉</div>
        <div>
          <div style="font-size: 18px; font-weight: bold;">报价已完成！</div>
          <div style="font-size: 14px; opacity: 0.9;">您的询价请求已收到报价</div>
        </div>
      </div>
      
      <div style="background: rgba(255,255,255,0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 4px;">报价金额：¥${price}</div>
        <div style="font-size: 12px; opacity: 0.9;">订单号：${uuid.substring(0, 8)}...</div>
      </div>
      
      <div style="font-size: 14px; margin-bottom: 12px;">
        💳 您现在可以完成支付，或联系客服了解更多详情。
      </div>
      
      <div style="display: flex; gap: 8px;">
        <button onclick="this.closest('.quote-notification').remove()" style="
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">稍后处理</button>
        <button onclick="window.location.href='/checkout'" style="
          background: white;
          color: #4caf50;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
        ">立即支付</button>
      </div>
    `;

    // 添加动画样式
    if (!document.getElementById('notification-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-animation-styles';
      style.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // 10秒后自动关闭
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideInRight 0.5s ease-out reverse';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 500);
      }
    }, 10000);
  }

  // 添加通知UI
  addNotificationUI() {
    // 在页面顶部添加状态指示器
    const statusIndicator = document.createElement('div');
    statusIndicator.id = 'quote-status-indicator';
    statusIndicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      z-index: 9999;
      display: none;
    `;
    statusIndicator.textContent = '🔄 正在检查报价状态...';
    document.body.appendChild(statusIndicator);
  }

  // 显示状态指示器
  showStatusIndicator(message) {
    const indicator = document.getElementById('quote-status-indicator');
    if (indicator) {
      indicator.textContent = message;
      indicator.style.display = 'block';
      setTimeout(() => {
        indicator.style.display = 'none';
      }, 3000);
    }
  }

  // 停止轮询
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// 自动启动系统
if (typeof window !== 'undefined') {
  window.quoteNotificationSystem = new QuoteNotificationSystem();
  
  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    if (window.quoteNotificationSystem) {
      window.quoteNotificationSystem.stop();
    }
  });
}

console.log('📱 实时报价通知系统已加载');
