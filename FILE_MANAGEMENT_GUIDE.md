# 文件管理系统使用指南

## 概述

本系统实现了完整的客户文件上传和员工文件管理功能，包括：

1. **客户端**：支持多种文件格式上传，智能处理2D/3D文件
2. **员工端**：完整的文件管理界面，支持批量下载和文件预览
3. **服务器端**：RESTful API，支持文件上传、下载、删除等操作

## 功能特性

### 客户上传功能
- ✅ 支持3D文件：STP、STEP、STL、OBJ、3MF、IGES
- ✅ 支持2D文件：DWG、DXF、PDF
- ✅ 支持压缩包：ZIP、RAR
- ✅ 智能文件处理：2D文件提示需要3D文件
- ✅ 多文件批量上传（最多20个文件）
- ✅ 文件大小限制（单个文件100MB）
- ✅ 实时3D预览
- ✅ 上传历史记录

### 员工管理功能
- ✅ 文件列表查看和搜索
- ✅ 按类型、日期筛选
- ✅ 批量选择和下载
- ✅ 单个文件下载
- ✅ 文件预览
- ✅ 文件删除
- ✅ 导出文件列表
- ✅ 下载统计

## 安装和部署

### 1. 环境要求
- Node.js 14.0.0 或更高版本
- npm 或 yarn 包管理器

### 2. 安装依赖
```bash
npm install
```

### 3. 启动服务器
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 4. 访问地址
- 客户上传页面：`http://localhost:3000/upload`
- 员工管理页面：`http://localhost:3000/admin/files`
- API文档：`http://localhost:3000/api`

## API接口文档

### 文件上传
```http
POST /api/upload
Content-Type: multipart/form-data

参数：
- files: 文件数组（最多20个）
- customerName: 客户姓名
- email: 客户邮箱
- phone: 客户电话（可选）
```

### 获取文件列表
```http
GET /api/files?page=1&limit=20&search=关键词&type=3d&date=week

参数：
- page: 页码（默认1）
- limit: 每页数量（默认20）
- search: 搜索关键词
- type: 文件类型（3d/2d/zip）
- date: 时间筛选（today/week/month）
```

### 下载单个文件
```http
GET /api/download/:fileId
```

### 批量下载文件
```http
POST /api/download/batch
Content-Type: application/json

{
  "fileIds": ["file-id-1", "file-id-2"]
}
```

### 删除文件
```http
DELETE /api/files/:fileId
```

### 获取统计信息
```http
GET /api/stats
```

## 文件处理逻辑

### 2D文件处理
当客户上传DXF、DWG、PDF等2D文件时：
1. 系统接收文件并保存
2. 显示提示信息："2D文件已接收。为了提供准确的报价和加工服务，请同时上传对应的3D文件（STP/STEP格式）。"
3. 文件仍然会被保存，员工可以在后台查看和下载

### 3D文件处理
- STP/STEP文件：使用Three.js进行3D渲染
- 其他3D文件：使用Model Viewer进行渲染
- 支持实时预览和交互操作

### ZIP文件处理
- 自动解压ZIP文件
- 查找其中的3D文件进行渲染
- 如果ZIP中没有3D文件，显示相应提示

## 数据库设计

### 文件记录结构
```javascript
{
  uploadId: "唯一上传ID",
  customerInfo: {
    customerName: "客户姓名",
    email: "客户邮箱",
    phone: "客户电话"
  },
  files: [
    {
      id: "文件ID",
      originalName: "原始文件名",
      filename: "存储文件名",
      path: "文件路径",
      size: "文件大小",
      mimetype: "MIME类型",
      uploadId: "所属上传ID"
    }
  ],
  uploadTime: "上传时间",
  status: "状态（completed/processing/error）",
  downloadCount: "下载次数"
}
```

## 安全考虑

### 文件上传安全
- 文件类型白名单验证
- 文件大小限制
- 文件数量限制
- 文件名安全处理

### 访问控制
- 建议添加身份验证中间件
- 员工管理页面需要登录验证
- API接口需要适当的权限控制

### 文件存储安全
- 文件存储在服务器安全目录
- 定期清理临时文件
- 备份重要文件

## 部署到生产环境

### 1. 环境变量配置
```bash
# .env文件
PORT=3000
NODE_ENV=production
UPLOAD_DIR=/var/uploads
MAX_FILE_SIZE=104857600
MAX_FILES=20
```

### 2. 使用PM2管理进程
```bash
npm install -g pm2
pm2 start file-upload-api-example.js --name "file-manager"
pm2 startup
pm2 save
```

### 3. 使用Nginx反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /uploads {
        alias /var/uploads;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4. 数据库集成
建议将内存存储替换为真实数据库：
- MongoDB（推荐）
- PostgreSQL
- MySQL

## 监控和日志

### 日志记录
系统会自动记录以下操作：
- 文件上传成功/失败
- 文件下载记录
- 错误和异常信息

### 监控指标
- 上传文件数量
- 下载文件数量
- 存储空间使用
- 系统性能指标

## 故障排除

### 常见问题

1. **文件上传失败**
   - 检查文件大小是否超过限制
   - 确认文件格式是否支持
   - 查看服务器日志

2. **3D预览不显示**
   - 确认浏览器支持WebGL
   - 检查Three.js库是否正确加载
   - 验证文件格式是否支持

3. **下载文件失败**
   - 检查文件是否存在于服务器
   - 确认文件权限设置
   - 查看网络连接状态

### 性能优化

1. **文件存储优化**
   - 使用CDN加速文件访问
   - 实现文件压缩
   - 定期清理过期文件

2. **数据库优化**
   - 添加适当的索引
   - 实现分页查询
   - 使用缓存机制

## 扩展功能

### 可能的增强功能
- 文件版本管理
- 文件审批流程
- 自动文件格式转换
- 文件预览增强
- 客户通知系统
- 文件分享链接

### 集成建议
- 与Shopify订单系统集成
- 与CRM系统集成
- 与ERP系统集成
- 与支付系统集成

## 技术支持

如有问题或需要技术支持，请联系开发团队或查看相关文档。

---

**注意**：本系统为示例实现，生产环境使用前请进行充分测试和安全评估。
