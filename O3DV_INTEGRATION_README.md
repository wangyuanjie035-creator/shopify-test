# Online3DViewer集成说明

## 概述

本项目已成功集成了Online3DViewer的3D可视化模型可编辑功能，在保持现有功能不变的基础上，为用户提供了更强大的3D模型查看和编辑体验。

## 新增功能

### 1. 高级3D查看器
- **STP文件支持**: 专门优化了STP文件的加载和显示
- **交互式控制**: 支持鼠标拖拽、缩放、旋转等操作
- **高质量渲染**: 提供更好的光照和材质效果

### 2. 模型编辑功能
- **测量工具**: 可以测量模型的距离、角度等尺寸
- **标注功能**: 支持在模型上添加文字标注
- **视图控制**: 重置视图、适合窗口等操作
- **导出功能**: 支持将模型导出为不同格式

### 3. 智能切换
- **自动检测**: 系统会自动检测STP文件并使用高级查看器
- **回退机制**: 如果高级查看器不可用，会自动回退到基础查看器
- **无缝集成**: 与现有的文件上传和参数配置功能完全兼容

## 文件结构

```
assets/
├── o3dv-minimal.js          # Online3DViewer简化版实现
├── o3dv-wrapper.js          # 高级查看器包装器类
├── o3dv-engine/            # Online3DViewer核心引擎文件
├── o3dv-website/           # Online3DViewer网站组件
└── model-uploader.js       # 已集成Online3DViewer的主文件
```

## 使用方法

### 1. 基本使用
用户上传STP文件后，系统会自动使用高级查看器进行显示：

```javascript
// 自动检测并使用高级查看器
const fileData = fileManager.files.get(fileId);
if (useAdvancedViewer && o3dvWrapper && is3DFile(fileData.file.name)) {
    await loadSTPWithAdvancedViewer(fileData.file);
}
```

### 2. 手动控制
开发者可以通过API手动控制查看器：

```javascript
// 获取查看器实例
const wrapper = ModelUploader.o3dvWrapper();

// 重置视图
wrapper.resetView();

// 启用测量
wrapper.enableMeasurement();

// 启用标注
wrapper.enableAnnotation();

// 导出模型
wrapper.exportModel('stl');
```

### 3. 切换查看器模式
```javascript
// 切换查看器模式
ModelUploader.toggleViewerMode();

// 获取查看器信息
const info = ModelUploader.getViewerInfo();
```

## 配置选项

### O3DVWrapper配置
```javascript
const wrapper = new O3DVWrapper('container-id', {
    width: 800,                    // 查看器宽度
    height: 600,                   // 查看器高度
    backgroundColor: {              // 背景色
        r: 248, g: 249, b: 250, a: 255
    },
    defaultColor: {                // 默认模型颜色
        r: 25, g: 118, b: 210
    },
    showEdges: false               // 是否显示边缘
});
```

## 控制按钮

高级查看器会自动添加以下控制按钮：

- **🔄 重置视图**: 将模型重置到最佳视角
- **📏 测量**: 启用测量工具
- **📝 标注**: 启用标注功能
- **💾 导出**: 导出当前模型

## 兼容性

### 浏览器支持
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

### 文件格式支持
- **主要支持**: STP (STEP) 文件
- **辅助支持**: STL, OBJ, 3MF, IGES
- **2D文件**: DWG, DXF, PDF

## 性能优化

### 1. 按需加载
- 只有在检测到STP文件时才加载高级查看器
- 基础查看器作为回退方案

### 2. 内存管理
- 自动清理不需要的3D模型资源
- 支持查看器的销毁和重建

### 3. 渲染优化
- 使用Three.js的高效渲染管线
- 支持阴影和光照效果

## 错误处理

### 1. 库加载失败
如果Online3DViewer库加载失败，系统会自动回退到基础Three.js查看器。

### 2. 文件加载失败
如果STP文件加载失败，会显示错误信息并提供重试选项。

### 3. 功能不可用
如果某些高级功能不可用，会显示相应的提示信息。

## 测试

运行测试文件验证集成功能：

```bash
# 在浏览器中打开测试文件
open test-o3dv-integration.html
```

测试内容包括：
- 库加载测试
- 基础查看器测试
- 高级查看器测试
- 集成功能测试

## 开发说明

### 1. 扩展功能
要添加新的编辑功能，可以在`O3DVWrapper`类中添加相应的方法：

```javascript
// 在O3DVWrapper类中添加新功能
enableNewFeature() {
    if (!this.isInitialized || !this.viewer) {
        console.error('O3DVWrapper: Viewer not initialized');
        return;
    }
    
    // 实现新功能
    console.log('O3DVWrapper: New feature enabled');
}
```

### 2. 自定义样式
可以通过CSS自定义查看器的外观：

```css
.o3dv-container {
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.viewer-controls button {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
}
```

### 3. 事件监听
可以监听查看器的各种事件：

```javascript
// 监听模型加载完成事件
wrapper.onModelLoaded = (model) => {
    console.log('Model loaded:', model);
};

// 监听视图变化事件
wrapper.onViewChanged = (camera) => {
    console.log('View changed:', camera);
};
```

## 故障排除

### 1. 查看器不显示
- 检查Three.js库是否正确加载
- 确认容器元素存在且有正确的尺寸
- 查看浏览器控制台是否有错误信息

### 2. STP文件加载失败
- 确认文件格式正确
- 检查文件大小是否超过限制
- 尝试使用其他STP文件测试

### 3. 控制按钮不响应
- 确认O3DVWrapper已正确初始化
- 检查事件监听器是否正确绑定
- 查看控制台是否有JavaScript错误

## 更新日志

### v1.0.0 (2025-01-16)
- 初始集成Online3DViewer功能
- 支持STP文件的 advanced viewing
- 添加测量、标注、导出功能
- 实现智能查看器切换
- 完整的错误处理和回退机制

## 联系支持

如果在使用过程中遇到问题，请：
1. 查看浏览器控制台的错误信息
2. 运行测试文件验证功能
3. 检查文件格式和大小限制
4. 联系技术支持团队

---

**注意**: 此集成保持了原有model-uploader的所有功能，包括文件上传、参数配置、购物车集成等，只是在3D模型查看方面提供了更强大的功能。
