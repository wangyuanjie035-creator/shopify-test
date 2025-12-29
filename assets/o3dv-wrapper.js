/**
 * Online3DViewer Wrapper for STP Files
 * 专门为model-uploader项目定制的3D查看器包装器
 */

class O3DVWrapper {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      width: 800,
      height: 600,
      backgroundColor: { r: 255, g: 255, b: 255, a: 255 },
      defaultColor: { r: 200, g: 200, b: 200 },
      showEdges: false,
      edgeColor: { r: 0, g: 0, b: 0 },
      edgeWidth: 1,
      ...options
    };
    
    this.viewer = null;
    this.isInitialized = false;
    this.currentModel = null;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error('O3DVWrapper: Container element not found');
      return;
    }

    // 创建查看器容器
    this.createViewerContainer();
    
    // 等待Online3DViewer库加载
    this.waitForO3DV();
  }

  createViewerContainer() {
    // 先隐藏原有的占位符
    const existingPlaceholder = this.container.querySelector('.viewer-placeholder');
    if (existingPlaceholder) {
      existingPlaceholder.style.display = 'none';
    }
    
    this.container.innerHTML = `
      <div class="o3dv-container" style="width: ${this.options.width}px; height: ${this.options.height}px; border: 1px solid #ddd; position: relative;">
        <div class="o3dv-loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; display: none;">
          <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #1976d2; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
          <p>正在加载3D查看器...</p>
        </div>
        <div class="o3dv-viewer" style="width: 100%; height: 100%; display: none; position: relative;">
          <div class="o3dv-center-loading" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;color:#666;font-size:14px;">
            <div class="spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #1976d2; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
            <p>分析你的设计</p>
          </div>
        </div>
        <div class="o3dv-error" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #f44336; display: none;">
          <p>3D查看器加载失败</p>
        </div>
      </div>
    `;

    // 添加CSS动画
    if (!document.getElementById('o3dv-styles')) {
      const style = document.createElement('style');
      style.id = 'o3dv-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .o3dv-container {
          background: #f8f9fa;
          border-radius: 8px;
          overflow: hidden;
        }
        .o3dv-viewer canvas {
          border-radius: 8px;
        }
      `;
      document.head.appendChild(style);
    }
  }

  waitForO3DV() {
    const start = Date.now();
    const checkInterval = setInterval(() => {
      if (typeof OV !== 'undefined') {
        clearInterval(checkInterval);
        this.initializeViewer();
      }
    }, 100);

    // 超时处理
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!this.isInitialized) {
        this.showError('Online3DViewer库加载超时');
        // 触发回退：对外暴露标记供上层回退
        this.failed = true;
      }
    }, 8000);
  }

  initializeViewer() {
    try {
      const viewerContainer = this.container.querySelector('.o3dv-viewer');
      
      // 创建EmbeddedViewer实例
      this.viewer = new OV.EmbeddedViewer(viewerContainer, {
        backgroundColor: new OV.RGBAColor(
          this.options.backgroundColor.r,
          this.options.backgroundColor.g,
          this.options.backgroundColor.b,
          this.options.backgroundColor.a
        ),
        defaultColor: new OV.RGBColor(
          this.options.defaultColor.r,
          this.options.defaultColor.g,
          this.options.defaultColor.b
        ),
        edgeSettings: new OV.EdgeSettings(
          this.options.showEdges,
          new OV.RGBColor(
            this.options.edgeColor.r,
            this.options.edgeColor.g,
            this.options.edgeColor.b
          ),
          this.options.edgeWidth
        ),
        // 增加内存限制以支持更大的文件
        memoryLimit: 100 * 1024 * 1024 // 100MB
      });

      // 隐藏所有加载指示器，显示查看器
      this.ensureLoadingHidden();
      viewerContainer.style.display = 'block';
      // 初始化时不显示loading，只在加载模型时显示
      
      // 确保初始化后立即隐藏所有可能的加载指示器
      setTimeout(() => {
        this.ensureLoadingHidden();
      }, 100);
      
      // 监听DOM变化，出现canvas后再次保证隐藏loading（双保险），并强制适配窗口
      const mo = new MutationObserver(() => {
        this.ensureLoadingHidden();
        try {
          if (this.viewer && typeof this.viewer.Resize === 'function') {
            this.viewer.Resize();
          }
        } catch (e) {}
      });
      mo.observe(viewerContainer, { childList: true, subtree: true });

      // 窗口尺寸变化时强制刷新渲染尺寸
      window.addEventListener('resize', () => {
        try {
          if (this.viewer && typeof this.viewer.Resize === 'function') {
            this.viewer.Resize();
          }
        } catch (e) {}
      });

      this.isInitialized = true;
      console.log('O3DVWrapper: Viewer initialized successfully');
      
    } catch (error) {
      console.error('O3DVWrapper: Failed to initialize viewer:', error);
      this.showError('3D查看器初始化失败');
    }
  }

  loadSTPFile(file) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return Promise.reject(new Error('查看器未初始化'));
    }

    return new Promise((resolve, reject) => {
      try {
        // 检查文件大小，如果超过50MB给出警告
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > 50) {
          console.warn(`Large file detected: ${fileSizeMB.toFixed(1)}MB. This may take longer to load or fail due to memory constraints.`);
        }
        
        // 显示加载状态
        this.showLoading();
        
        // 加载STP文件
        this.viewer.LoadModelFromFileList([file], () => {
          // 立即隐藏加载指示器
          this.hideLoadingSafely();
          this.currentModel = file;
          console.log('O3DVWrapper: STP file loaded successfully');
          
          // 渲染完成后适配窗口并触发一次重绘
          try {
            if (this.viewer && typeof this.viewer.FitToWindow === 'function') {
              this.viewer.FitToWindow();
            }
            if (this.viewer && typeof this.viewer.Resize === 'function') {
              this.viewer.Resize();
            }
          } catch (e) {}
          
          // 延迟一帧再次适配，确保加载指示器完全隐藏
          requestAnimationFrame(() => {
            try {
              if (this.viewer && typeof this.viewer.Resize === 'function') {
                this.viewer.Resize();
              }
              if (this.viewer && typeof this.viewer.FitToWindow === 'function') {
                this.viewer.FitToWindow();
              }
            } catch (e) {}
            // 再次确保加载指示器隐藏
            this.hideLoadingSafely();
          });
          
          resolve(file);
        });
        // 超时兜底：根据文件大小调整超时时间，大文件给更多时间
        this._loadingFallbackTimer && clearTimeout(this._loadingFallbackTimer);
        const timeoutMs = fileSizeMB > 50 ? 30000 : 15000; // 大文件30秒，小文件15秒
        this._loadingFallbackTimer = setTimeout(() => this.hideLoadingSafely(), timeoutMs);
        
      } catch (error) {
        this.hideLoadingSafely();
        console.error('O3DVWrapper: Failed to load STP file:', error);
        reject(error);
      }
    });
  }

  loadSTPFromUrl(url) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return Promise.reject(new Error('查看器未初始化'));
    }

    return new Promise((resolve, reject) => {
      try {
        this.showLoading();
        
        this.viewer.LoadModelFromUrlList([url], () => {
          this.hideLoading();
          console.log('O3DVWrapper: STP file loaded from URL successfully');
          resolve(url);
        });
        
      } catch (error) {
        this.hideLoading();
        console.error('O3DVWrapper: Failed to load STP file from URL:', error);
        reject(error);
      }
    });
  }

  // 测量功能
  enableMeasurement() {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    // 这里可以添加测量功能的实现
    console.log('O3DVWrapper: Measurement enabled');
  }

  // 标注功能
  enableAnnotation() {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    // 这里可以添加标注功能的实现
    console.log('O3DVWrapper: Annotation enabled');
  }

  // 导出功能
  exportModel(format = 'stl') {
    if (!this.isInitialized || !this.viewer || !this.currentModel) {
      console.error('O3DVWrapper: No model to export');
      return Promise.reject(new Error('没有可导出的模型'));
    }

    return new Promise((resolve, reject) => {
      try {
        // 这里可以添加导出功能的实现
        console.log(`O3DVWrapper: Exporting model to ${format}`);
        resolve();
      } catch (error) {
        console.error('O3DVWrapper: Export failed:', error);
        reject(error);
      }
    });
  }

  // 重置视图
  resetView() {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    this.viewer.FitToWindow();
  }

  // 设置背景色
  setBackgroundColor(color) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    this.viewer.SetBackgroundColor(new OV.RGBAColor(color.r, color.g, color.b, color.a));
  }

  // 设置模型颜色
  setModelColor(color) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    this.viewer.SetDefaultColor(new OV.RGBColor(color.r, color.g, color.b));
  }

  // 显示/隐藏边缘
  setShowEdges(show) {
    if (!this.isInitialized || !this.viewer) {
      console.error('O3DVWrapper: Viewer not initialized');
      return;
    }

    this.viewer.SetEdgeSettings(new OV.EdgeSettings(show, new OV.RGBColor(0, 0, 0), 1));
  }

  // 获取模型信息
  getModelInfo() {
    if (!this.isInitialized || !this.viewer) {
      return null;
    }

    return {
      hasModel: this.currentModel !== null,
      fileName: this.currentModel ? this.currentModel.name : null,
      // 可以添加更多模型信息
    };
  }

  // 销毁查看器
  destroy() {
    if (this.viewer) {
      // 清理资源
      this.viewer = null;
    }
    this.isInitialized = false;
    this.currentModel = null;
  }

  // 辅助方法
  showLoading() {
    const loading = this.container.querySelector('.o3dv-loading');
    if (loading) {
      loading.style.display = 'block';
    }
    const center = this.container.querySelector('.o3dv-center-loading');
    if (center) center.style.display = 'block';
  }

  hideLoading() {
    const loading = this.container.querySelector('.o3dv-loading');
    if (loading) {
      loading.style.display = 'none';
    }
    const center = this.container.querySelector('.o3dv-center-loading');
    if (center) center.style.display = 'none';
  }

  ensureLoadingHidden() {
    const loading = this.container.querySelector('.o3dv-loading');
    if (loading) loading.style.display = 'none';
    const centerLoading = this.container.querySelector('.o3dv-center-loading');
    if (centerLoading) {
      centerLoading.style.display = 'none';
      console.log('O3DVWrapper: Hidden center loading indicator');
    }
  }

  hideLoadingSafely() {
    this.ensureLoadingHidden();
    // 同时隐藏占位符文本（如果被外部注入）
    const placeholder = this.container.querySelector('.viewer-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }

  showError(message) {
    const error = this.container.querySelector('.o3dv-error');
    if (error) {
      error.querySelector('p').textContent = message;
      error.style.display = 'block';
    }
  }

  hideError() {
    const error = this.container.querySelector('.o3dv-error');
    if (error) {
      error.style.display = 'none';
    }
  }
}

// 导出到全局
window.O3DVWrapper = O3DVWrapper;
