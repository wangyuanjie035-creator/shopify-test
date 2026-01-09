/**
 * ═══════════════════════════════════════════════════════════════
 * 共享工具库 - 供所有 API 路由使用
 * ═══════════════════════════════════════════════════════════════
 * 
 * 注意：使用下划线前缀，Vercel 不会将其识别为 API 路由
 * 
 * 包含：
 * - CORS 配置
 * - Shopify API 客户端
 * - 权限验证服务
 * - 错误处理工具
 * - Draft Order 业务服务
 */

// ═══════════════════════════════════════════════════════════
// CORS 配置
// ═══════════════════════════════════════════════════════════

export function setCorsHeaders(req, res) {
  const allowedOrigins = new Set([
    'https://sain-pdc-test.myshopify.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'null',
  ]);

  const headerOrigin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let origin = headerOrigin;
  if (!origin && referer) {
    try {
      origin = new URL(referer).origin;
    } catch {}
  }

  const allow = allowedOrigins.has(origin) ? origin : 'https://sain-pdc-test.myshopify.com';
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ═══════════════════════════════════════════════════════════
// 错误处理工具
// ═══════════════════════════════════════════════════════════

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
};

export const ErrorCodes = {
  MISSING_EMAIL: 'missing_email',
  INVALID_EMAIL: 'invalid_email',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFIGURATION_ERROR: 'configuration_error',
  SHOPIFY_API_ERROR: 'shopify_api_error',
  MISSING_PARAMETER: 'missing_parameter',
  METHOD_NOT_ALLOWED: 'method_not_allowed',
  VALIDATION_ERROR: 'validation_error'
};

export function createErrorResponse({ status = 500, error, message, details }) {
  const response = {
    success: false,
    error: error || 'unknown_error',
    message: message || '操作失败',
    timestamp: new Date().toISOString()
  };
  if (details !== undefined) {
    response.details = details;
  }
  return { status, body: response };
}

export function createSuccessResponse(data = {}, status = 200, message) {
  const response = {
    success: true,
    ...data,
    timestamp: new Date().toISOString()
  };
  if (message) {
    response.message = message;
  }
  return { status, body: response };
}

export function handleError(error, res, options = {}) {
  const { defaultStatus = 500, context = '操作' } = options;

  let status = defaultStatus;
  let errorCode = 'unknown_error';
  let errorMessage = '操作失败';

  if (error instanceof Error) {
    errorMessage = error.message;
    if (error.message.includes('配置缺失') || error.message.includes('Missing')) {
      status = 500;
      errorCode = 'configuration_error';
    } else if (error.message.includes('GraphQL') || error.message.includes('API')) {
      status = 502;
      errorCode = 'shopify_api_error';
    } else if (error.message.includes('forbidden') || error.message.includes('无权')) {
      status = 403;
      errorCode = 'forbidden';
    } else if (error.message.includes('未找到') || error.message.includes('不存在')) {
      status = 404;
      errorCode = 'not_found';
    } else if (error.message.includes('缺少') || error.message.includes('Missing')) {
      status = 400;
      errorCode = 'missing_parameter';
    }
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object') {
    errorCode = error.error || errorCode;
    errorMessage = error.message || errorMessage;
    status = error.status || defaultStatus;
  }

  console.error(`❌ ${context}失败:`, {
    error: errorMessage,
    code: errorCode,
    status,
    stack: error instanceof Error ? error.stack : undefined
  });

  const errorResponse = createErrorResponse({
    status,
    error: errorCode,
    message: errorMessage
  });

  if (res) {
    return res.status(errorResponse.status).json(errorResponse.body);
  }
  return errorResponse;
}

// ═══════════════════════════════════════════════════════════
// 权限验证服务
// ═══════════════════════════════════════════════════════════

class AuthService {
  constructor() {
    this.adminWhitelist = this.parseAdminWhitelist();
  }

  parseAdminWhitelist() {
    const raw = process.env.ADMIN_EMAIL_WHITELIST || 
                'jonathan.wang@sainstore.com,issac.yu@sainstore.com';
    return raw
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);
  }

  normalizeEmail(email) {
    if (!email || typeof email !== 'string') {
      return '';
    }
    return email.trim().toLowerCase();
  }

  isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isAdmin(email) {
    const normalizedEmail = this.normalizeEmail(email);
    return this.adminWhitelist.includes(normalizedEmail);
  }

  hasAdminPermission({ email, admin }) {
    const normalizedEmail = this.normalizeEmail(email);
    const adminFlag = ['1', 'true', 'yes'].includes(
      String(admin || '').toLowerCase()
    );
    return adminFlag && this.isAdmin(normalizedEmail);
  }

  validateEmail(email) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      return {
        valid: false,
        error: 'missing_email',
        message: '缺少客户邮箱，无法验证身份'
      };
    }
    if (!this.isValidEmail(normalizedEmail)) {
      return {
        valid: false,
        error: 'invalid_email',
        message: `邮箱格式无效: ${normalizedEmail}`
      };
    }
    return { valid: true };
  }

  verifyDraftOrderOwnership(requesterEmail, orderEmail, isAdmin = false) {
    if (isAdmin) {
      return { authorized: true };
    }
    const normalizedRequester = this.normalizeEmail(requesterEmail);
    const normalizedOrder = this.normalizeEmail(orderEmail);
    if (!normalizedOrder || normalizedOrder !== normalizedRequester) {
      return {
        authorized: false,
        error: 'forbidden',
        message: '仅允许访问本人未支付的询价单'
      };
    }
    return { authorized: true };
  }

  extractAuthFromRequest(req) {
    const email = req.body?.email || req.query?.email || '';
    const admin = req.body?.admin || req.query?.admin || '';
    const normalizedEmail = this.normalizeEmail(email);
    const isAdmin = this.hasAdminPermission({ email: normalizedEmail, admin });
    return { email: normalizedEmail, isAdmin };
  }
}

export const authService = new AuthService();

// ═══════════════════════════════════════════════════════════
// Shopify API 客户端
// ═══════════════════════════════════════════════════════════

class ShopifyClient {
  constructor() {
    this.storeDomain = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOP;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.ADMIN_TOKEN;
    this.apiVersion = '2024-01';
    this.endpoint = this.storeDomain 
      ? `https://${this.storeDomain}/admin/api/${this.apiVersion}/graphql.json`
      : null;
  }

  isConfigured() {
    return !!(this.storeDomain && this.accessToken);
  }

  async query(query, variables = {}) {
    if (!this.isConfigured()) {
      throw new Error('Shopify 配置缺失：请设置 SHOPIFY_STORE_DOMAIN/SHOP 和 SHOPIFY_ACCESS_TOKEN/ADMIN_TOKEN');
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`Shopify API 请求失败: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();

      if (json.errors && json.errors.length > 0) {
        const firstError = json.errors[0];
        console.error('GraphQL 错误:', json.errors);
        throw new Error(`GraphQL 错误: ${firstError.message}`);
      }

      if (json.data) {
        const mutationKeys = Object.keys(json.data);
        for (const key of mutationKeys) {
          const mutationResult = json.data[key];
          if (mutationResult && mutationResult.userErrors && mutationResult.userErrors.length > 0) {
            const firstUserError = mutationResult.userErrors[0];
            throw new Error(`操作失败: ${firstUserError.message}`);
          }
        }
      }

      return json;
    } catch (error) {
      if (error.message.includes('Shopify') || error.message.includes('GraphQL')) {
        throw error;
      }
      throw new Error(`Shopify API 调用失败: ${error.message}`);
    }
  }

  async getDraftOrder(draftOrderId) {
    const query = `
      query($id: ID!) {
        draftOrder(id: $id) {
          id
          name
          email
          totalPrice
          status
          createdAt
          updatedAt
          invoiceUrl
          note
          lineItems(first: 20) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPrice
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }
    `;
    const result = await this.query(query, { id: draftOrderId });
    return result.data?.draftOrder || null;
  }

  async getDraftOrders({ first = 50, search = '' } = {}) {
    const query = `
      query($first: Int!, $search: String!) {
        draftOrders(first: $first, query: $search) {
          edges {
            node {
              id
              name
              email
              totalPrice
              status
              createdAt
              updatedAt
              invoiceUrl
              note
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                    originalUnitPrice
                    customAttributes {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const result = await this.query(query, { first, search });
    return (result.data?.draftOrders?.edges || []).map(edge => edge.node);
  }

  async createDraftOrder(input) {
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            email
            invoiceUrl
            totalPrice
            createdAt
            lineItems(first: 20) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPrice
                  customAttributes { key value }
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `;
    const result = await this.query(mutation, { input });
    return result.data?.draftOrderCreate?.draftOrder || null;
  }

  async updateDraftOrder(draftOrderId, input) {
    const mutation = `
      mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            totalPrice
            updatedAt
          }
          userErrors { field message }
        }
      }
    `;
    const result = await this.query(mutation, { id: draftOrderId, input });
    return result.data?.draftOrderUpdate?.draftOrder || null;
  }

  async deleteDraftOrder(draftOrderId) {
    const mutation = `
      mutation draftOrderDelete($input: DraftOrderDeleteInput!) {
        draftOrderDelete(input: $input) {
          deletedId
          userErrors { field message }
        }
      }
    `;
    const result = await this.query(mutation, {
      input: { id: draftOrderId }
    });
    return result.data?.draftOrderDelete?.deletedId || null;
  }

  async sendInvoiceEmail(draftOrderId) {
    const mutation = `
      mutation draftOrderInvoiceSend($id: ID!) {
        draftOrderInvoiceSend(id: $id) {
          draftOrder {
            id
            name
            invoiceUrl
          }
          userErrors { field message }
        }
      }
    `;
    const result = await this.query(mutation, { id: draftOrderId });
    return result.data?.draftOrderInvoiceSend?.draftOrder || null;
  }
}

export const shopifyClient = new ShopifyClient();

// ═══════════════════════════════════════════════════════════
// Draft Order 业务服务层
// ═══════════════════════════════════════════════════════════

class DraftOrderService {
  formatDraftOrder(draftOrder) {
    if (!draftOrder) {
      console.warn('formatDraftOrder: draftOrder 为 null 或 undefined');
      return null;
    }

    try {
      let lineItemsArray = [];
      if (draftOrder.lineItems?.edges && Array.isArray(draftOrder.lineItems.edges)) {
        lineItemsArray = draftOrder.lineItems.edges.map(edge => edge.node).filter(Boolean);
      } else if (Array.isArray(draftOrder.lineItems)) {
        lineItemsArray = draftOrder.lineItems;
      }

      const firstLineItem = lineItemsArray[0] || {};
      const customAttributes = Array.isArray(firstLineItem.customAttributes) 
        ? firstLineItem.customAttributes 
        : [];

      const getAttribute = (key) => {
        const attr = customAttributes.find(a => a && a.key === key);
        return attr ? attr.value : null;
      };

      let orderStatus = 'pending';
      const statusAttr = getAttribute('状态');
      if (statusAttr === '已报价') {
        orderStatus = 'quoted';
      }

      return {
        id: draftOrder.id || null,
        name: draftOrder.name || null,
        email: draftOrder.email || null,
        status: orderStatus,
        totalPrice: draftOrder.totalPrice || '0.00',
        createdAt: draftOrder.createdAt || null,
        updatedAt: draftOrder.updatedAt || null,
        invoiceUrl: draftOrder.invoiceUrl || 'data:stored',
        fileId: getAttribute('文件ID'),
        fileData: getAttribute('文件数据'),
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
      throw new Error(`格式化 Draft Order 失败: ${error.message}`);
    }
  }

  async getDraftOrder(draftOrderId, { requesterEmail, isAdmin = false } = {}) {
    const draftOrder = await shopifyClient.getDraftOrder(draftOrderId);
    if (!draftOrder) {
      throw new Error('未找到询价单');
    }
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
    return this.formatDraftOrder(draftOrder);
  }

  async getDraftOrders({ requesterEmail, isAdmin = false, status, limit = 50 } = {}) {
    try {
      const search = isAdmin
        ? (status && status !== 'all' ? `status:${status}` : '')
        : `email:"${requesterEmail}"`;

      const draftOrders = await shopifyClient.getDraftOrders({
        first: limit,
        search
      });

      if (!Array.isArray(draftOrders)) {
        return {
          draftOrders: [],
          total: 0,
          pending: 0,
          quoted: 0
        };
      }

      const formattedOrders = draftOrders
        .map(order => {
          try {
            return this.formatDraftOrder(order);
          } catch (error) {
            console.error('格式化订单失败:', error);
            return null;
          }
        })
        .filter(order => order !== null);

      let filteredOrders = isAdmin
        ? formattedOrders
        : formattedOrders.filter(order => {
            const orderEmail = authService.normalizeEmail(order.email);
            const requesterEmailNormalized = authService.normalizeEmail(requesterEmail);
            return orderEmail === requesterEmailNormalized;
          });

      if (status && status !== 'all') {
        filteredOrders = filteredOrders.filter(order => order.status === status);
      }

      const total = formattedOrders.length;
      const pending = formattedOrders.filter(o => o.status === 'pending').length;
      const quoted = formattedOrders.filter(o => o.status === 'quoted').length;

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

  async createDraftOrder(input, options = {}) {
    const { email, name, fileName, lineItems = [] } = input;
    const quoteId = `Q${Date.now()}`;

    const processedLineItems = this.processLineItems(lineItems, {
      quoteId,
      fileName,
      ...options
    });

    const draftOrderInput = {
      email: authService.normalizeEmail(email),
      taxExempt: true,
      lineItems: processedLineItems,
      note: `询价单号: ${quoteId}\n客户: ${name || '客户'}\n文件: ${fileName || '未提供'}`
    };

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

  async updateQuote(draftOrderId, { amount, note, senderEmail }) {
    const currentOrder = await shopifyClient.getDraftOrder(draftOrderId);
    if (!currentOrder) {
      throw new Error('未找到草稿订单');
    }
    if (currentOrder.lineItems.edges.length === 0) {
      throw new Error('订单中没有订单项');
    }

    const firstLineItem = currentOrder.lineItems.edges[0].node;
    const updatedAttributes = [
      ...firstLineItem.customAttributes.filter(attr => 
        !['状态', '报价金额', '报价时间', '备注', '客服邮箱'].includes(attr.key)
      ),
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

  async deleteDraftOrder(draftOrderId, { requesterEmail, isAdmin = false } = {}) {
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
    const deletedId = await shopifyClient.deleteDraftOrder(draftOrderId);
    if (!deletedId) {
      throw new Error('删除失败');
    }
    return deletedId;
  }

  processLineItems(lineItems, options = {}) {
    const { quoteId, fileName } = options;
    if (Array.isArray(lineItems) && lineItems.length > 0) {
      return lineItems.map((item, index) => {
        const attrs = Array.isArray(item.customAttributes) ? item.customAttributes : [];
        const attrMap = new Map();
        attrs.forEach((a) => {
          if (!a || !a.key) return;
          const value = String(a.value || '');
          if (value.length > 20000) {
            console.warn('⚠️ 跳过过长自定义字段:', a.key);
            return;
          }
          attrMap.set(a.key, value);
        });
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

export const draftOrderService = new DraftOrderService();