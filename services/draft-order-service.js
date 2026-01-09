/**
 * Draft Order 业务服务层
 * 
 * 职责：
 * - Draft Order 相关的业务逻辑
 * - 数据转换和格式化
 * - 业务规则验证
 */

import { shopifyClient } from '../utils/shopify-client.js';
import { authService } from '../utils/auth-service.js';

class DraftOrderService {
  /**
   * 获取 Draft Order 详情
   * @param {string} draftOrderId - Draft Order ID
   * @param {object} options - 选项
   * @param {string} options.requesterEmail - 请求者邮箱
   * @param {boolean} options.isAdmin - 是否为管理员
   * @returns {Promise<object>} Draft Order 详情
   */
  async getDraftOrder(draftOrderId, { requesterEmail, isAdmin = false } = {}) {
    // 获取 Draft Order
    const draftOrder = await shopifyClient.getDraftOrder(draftOrderId);

    if (!draftOrder) {
      throw new Error('未找到询价单');
    }

    // 权限验证：非管理员需要验证所有权
    if (!isAdmin) {
      const ownershipCheck = authService.verifyDraftOrderOwnership(
        requesterEmail,
        draftOrder.email,
        false
      );
      
      if (!ownershipCheck.authorized) {
        throw new Error(ownershipCheck.message || '无权访问该询价单');
      }
    }

    // 格式化数据
    return this.formatDraftOrder(draftOrder);
  }

  /**
   * 获取 Draft Orders 列表
   * @param {object} options - 查询选项
   * @param {string} options.requesterEmail - 请求者邮箱
   * @param {boolean} options.isAdmin - 是否为管理员
   * @param {string} options.status - 状态过滤
   * @param {number} options.limit - 数量限制
   * @returns {Promise<object>} { draftOrders, total, pending, quoted }
   */
  async getDraftOrders({ requesterEmail, isAdmin = false, status, limit = 50 } = {}) {
    try {
      // 构建搜索查询
      const search = isAdmin
        ? (status && status !== 'all' ? `status:${status}` : '')
        : `email:"${requesterEmail}"`;

      console.log('🔍 查询 Draft Orders:', { search, limit, isAdmin });

      // 获取 Draft Orders
      const draftOrders = await shopifyClient.getDraftOrders({
        first: limit,
        search
      });

      console.log('✅ 获取到 Draft Orders 数量:', draftOrders?.length || 0);

      if (!Array.isArray(draftOrders)) {
        console.error('❌ draftOrders 不是数组:', typeof draftOrders);
        return {
          draftOrders: [],
          total: 0,
          pending: 0,
          quoted: 0
        };
      }

      // 格式化数据，过滤掉 null 值
      const formattedOrders = draftOrders
        .map(order => {
          try {
            return this.formatDraftOrder(order);
          } catch (error) {
            console.error('格式化订单失败:', error, order);
            return null;
          }
        })
        .filter(order => order !== null);

      console.log('✅ 格式化后的订单数量:', formattedOrders.length);

      // 按邮箱兜底过滤（管理员除外）
      let filteredOrders = isAdmin
        ? formattedOrders
        : formattedOrders.filter(order => {
            const orderEmail = authService.normalizeEmail(order.email);
            const requesterEmailNormalized = authService.normalizeEmail(requesterEmail);
            return orderEmail === requesterEmailNormalized;
          });

      // 状态过滤
      if (status && status !== 'all') {
        filteredOrders = filteredOrders.filter(order => order.status === status);
      }

      // 计算统计信息（基于所有订单，而不是过滤后的）
      const total = formattedOrders.length;
      const pending = formattedOrders.filter(o => o.status === 'pending').length;
      const quoted = formattedOrders.filter(o => o.status === 'quoted').length;

      console.log('✅ 最终返回:', { 
        filtered: filteredOrders.length, 
        total, 
        pending, 
        quoted 
      });

      return {
        draftOrders: filteredOrders,
        total,
        pending,
        quoted
      };
    } catch (error) {
      console.error('❌ getDraftOrders 失败:', error);
      throw error;
    }
  }

  /**
   * 创建 Draft Order
   * @param {object} input - Draft Order 输入
   * @param {string} input.email - 客户邮箱
   * @param {string} input.name - 客户名称
   * @param {string} input.fileName - 文件名
   * @param {Array} input.lineItems - 订单项
   * @param {object} options - 选项
   * @returns {Promise<object>} 创建的 Draft Order
   */
  async createDraftOrder(input, options = {}) {
    const { email, name, fileName, lineItems = [] } = input;

    // 生成询价单号
    const quoteId = `Q${Date.now()}`;

    // 处理 lineItems
    const processedLineItems = this.processLineItems(lineItems, {
      quoteId,
      fileName,
      ...options
    });

    // 构建 Draft Order 输入
    const draftOrderInput = {
      email: authService.normalizeEmail(email),
      taxExempt: true,
      lineItems: processedLineItems,
      note: `询价单号: ${quoteId}\n客户: ${name || '客户'}\n文件: ${fileName || '未提供'}`
    };

    // 创建 Draft Order
    const draftOrder = await shopifyClient.createDraftOrder(draftOrderInput);

    if (!draftOrder) {
      throw new Error('Draft Order 创建失败');
    }

    return {
      quoteId,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl,
      customerEmail: email,
      fileName: fileName || '未提供'
    };
  }

  /**
   * 更新 Draft Order 报价
   * @param {string} draftOrderId - Draft Order ID
   * @param {object} updateData - 更新数据
   * @param {number} updateData.amount - 报价金额
   * @param {string} updateData.note - 备注
   * @param {string} updateData.senderEmail - 客服邮箱
   * @returns {Promise<object>} 更新后的 Draft Order
   */
  async updateQuote(draftOrderId, { amount, note, senderEmail }) {
    // 获取当前 Draft Order
    const currentOrder = await shopifyClient.getDraftOrder(draftOrderId);
    
    if (!currentOrder) {
      throw new Error('未找到草稿订单');
    }

    if (currentOrder.lineItems.edges.length === 0) {
      throw new Error('订单中没有订单项');
    }

    const firstLineItem = currentOrder.lineItems.edges[0].node;

    // 构建更新的自定义属性
    const updatedAttributes = [
      // 保留原有属性（过滤掉状态相关的）
      ...firstLineItem.customAttributes.filter(attr => 
        !['状态', '报价金额', '报价时间', '备注', '客服邮箱'].includes(attr.key)
      ),
      // 添加新的状态属性
      { key: '状态', value: '已报价' },
      { key: '报价金额', value: `¥${amount}` },
      { key: '报价时间', value: new Date().toISOString() }
    ];

    if (note) {
      updatedAttributes.push({ key: '备注', value: note });
    }

    if (senderEmail) {
      updatedAttributes.push({ key: '客服邮箱', value: senderEmail });
    }

    // 构建更新输入
    const updateInput = {
      taxExempt: true,
      lineItems: [{
        title: firstLineItem.title,
        quantity: firstLineItem.quantity,
        originalUnitPrice: amount.toString(),
        customAttributes: updatedAttributes
      }],
      note: `已报价: ¥${amount}\n报价时间: ${new Date().toLocaleString('zh-CN')}\n${note || ''}`
    };

    // 更新 Draft Order
    const updatedOrder = await shopifyClient.updateDraftOrder(draftOrderId, updateInput);

    if (!updatedOrder) {
      throw new Error('更新草稿订单失败');
    }

    return {
      draftOrderId: updatedOrder.id,
      draftOrderName: updatedOrder.name || currentOrder.name,
      invoiceUrl: updatedOrder.invoiceUrl || currentOrder.invoiceUrl,
      totalPrice: updatedOrder.totalPrice,
      customerEmail: currentOrder.email,
      updatedAt: updatedOrder.updatedAt
    };
  }

  /**
   * 删除 Draft Order
   * @param {string} draftOrderId - Draft Order ID
   * @param {object} options - 选项
   * @param {string} options.requesterEmail - 请求者邮箱
   * @param {boolean} options.isAdmin - 是否为管理员
   * @returns {Promise<string>} 删除的 ID
   */
  async deleteDraftOrder(draftOrderId, { requesterEmail, isAdmin = false } = {}) {
    // 如果不是管理员，需要验证所有权
    if (!isAdmin) {
      const draftOrder = await shopifyClient.getDraftOrder(draftOrderId);
      
      if (!draftOrder) {
        throw new Error('未找到询价单');
      }

      const ownershipCheck = authService.verifyDraftOrderOwnership(
        requesterEmail,
        draftOrder.email,
        false
      );

      if (!ownershipCheck.authorized) {
        throw new Error(ownershipCheck.message || '无权删除该询价单');
      }
    }

    // 删除 Draft Order
    const deletedId = await shopifyClient.deleteDraftOrder(draftOrderId);

    if (!deletedId) {
      throw new Error('删除失败');
    }

    return deletedId;
  }

  /**
   * 格式化 Draft Order 数据
   * @param {object} draftOrder - 原始 Draft Order 数据
   * @returns {object} 格式化后的数据
   */
  formatDraftOrder(draftOrder) {
    if (!draftOrder) {
      console.warn('formatDraftOrder: draftOrder 为 null 或 undefined');
      return null;
    }

    try {
      // 处理 lineItems：可能是 edges 格式（从 API）或数组格式（已处理）
      let lineItemsArray = [];
      if (draftOrder.lineItems?.edges && Array.isArray(draftOrder.lineItems.edges)) {
        // GraphQL edges 格式
        lineItemsArray = draftOrder.lineItems.edges.map(edge => edge.node).filter(Boolean);
      } else if (Array.isArray(draftOrder.lineItems)) {
        // 已经是数组格式
        lineItemsArray = draftOrder.lineItems;
      }

      // 从第一个 lineItem 的 customAttributes 中提取信息
      const firstLineItem = lineItemsArray[0] || {};
      const customAttributes = Array.isArray(firstLineItem.customAttributes) 
        ? firstLineItem.customAttributes 
        : [];

      const getAttribute = (key) => {
        const attr = customAttributes.find(a => a && a.key === key);
        return attr ? attr.value : null;
      };

      // 提取状态
      let orderStatus = 'pending';
      const statusAttr = getAttribute('状态');
      if (statusAttr === '已报价') {
        orderStatus = 'quoted';
      }

      // 提取文件信息
      const fileId = getAttribute('文件ID');
      const fileData = getAttribute('文件数据');

      return {
        id: draftOrder.id || null,
        name: draftOrder.name || null,
        email: draftOrder.email || null,
        status: orderStatus,
        totalPrice: draftOrder.totalPrice || '0.00',
        createdAt: draftOrder.createdAt || null,
        updatedAt: draftOrder.updatedAt || null,
        invoiceUrl: draftOrder.invoiceUrl || 'data:stored',
        fileId,
        fileData,
        note: draftOrder.note || null,
        lineItems: lineItemsArray.map(item => ({
          id: item.id || null,
          title: item.title || '',
          quantity: item.quantity || 1,
          originalUnitPrice: item.originalUnitPrice || '0.00',
          price: item.originalUnitPrice || '0.00',
          customAttributes: Array.isArray(item.customAttributes) ? item.customAttributes : []
        }))
      };
    } catch (error) {
      console.error('formatDraftOrder 格式化错误:', error);
      console.error('draftOrder 数据:', JSON.stringify(draftOrder, null, 2));
      throw new Error(`格式化 Draft Order 失败: ${error.message}`);
    }
  }

  /**
   * 处理 lineItems
   * @param {Array} lineItems - 原始 lineItems
   * @param {object} options - 选项
   * @returns {Array} 处理后的 lineItems
   */
  processLineItems(lineItems, options = {}) {
    const { quoteId, fileName } = options;

    if (Array.isArray(lineItems) && lineItems.length > 0) {
      // 使用前端传入的 lineItems
      return lineItems.map((item, index) => {
        const attrs = Array.isArray(item.customAttributes) ? item.customAttributes : [];
        const attrMap = new Map();

        attrs.forEach((a) => {
          if (!a || !a.key) return;
          const value = String(a.value || '');
          if (value.length > 20000) {
            console.warn('⚠️ 跳过过长自定义字段:', a.key, '长度:', value.length);
            return;
          }
          attrMap.set(a.key, value);
        });

        // 第一个 item 添加订单级别属性
        if (index === 0) {
          attrMap.set('询价单号', quoteId);
          attrMap.set('文件', fileName || item.title || 'model.stl');
        }

        return {
          title: item.title || `3D打印服务 - ${fileName || 'model.stl'}`,
          quantity: parseInt(item.quantity || 1, 10) || 1,
          originalUnitPrice: '0.00',
          customAttributes: Array.from(attrMap.entries()).map(([key, value]) => ({
            key,
            value
          }))
        };
      });
    }

    // 旧版单文件模式
    return [{
      title: `3D打印服务 - ${fileName || 'model.stl'}`,
      quantity: 1,
      originalUnitPrice: '0.00',
      customAttributes: [
        { key: '文件', value: fileName || 'model.stl' },
        { key: '询价单号', value: quoteId }
      ]
    }];
  }
}

// 导出单例实例
export const draftOrderService = new DraftOrderService();

// 也导出类以便测试
export default DraftOrderService;