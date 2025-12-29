/**
 * 3D Model Uploader - New Version
 * 实现类似 i.materialise 的布局和功能
 */

(function() {
  'use strict';

  // 全局变量
  let selectedFiles = [];
  let currentModel = null;
  let viewer = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  let modelDimensions = { width: 0, height: 0, depth: 0 };

  // DOM 元素
  let fileInput, dropzone, modelViewer, viewerContainer;
  let loadingIndicator, errorMessage, fileList, fileItems;
  let materialSelect, finishSelect, scaleSlider, scaleValue;
  let qtyInput, qtyMinus, qtyPlus;
  let dimensionsDisplay, dimensionsValue;
  let addToCartBtn, form;
  let hasThreadRadios, hasAssemblyRadios, toleranceSelect, roughnessSelect, noteTextarea;
  let precisionSelect, charCount;

  // 初始化
  function init() {
    console.log('Initializing 3D Model Uploader (New)...');
    
    // 获取DOM元素
    fileInput = document.getElementById('uploader-input');
    dropzone = document.getElementById('dropzone');
    modelViewer = document.getElementById('model-viewer');
    viewerContainer = document.getElementById('viewer-container');
    loadingIndicator = document.getElementById('loading-indicator');
    errorMessage = document.getElementById('error-message');
    fileList = document.getElementById('file-list');
    fileItems = document.getElementById('file-items');
    materialSelect = document.getElementById('material');
    finishSelect = document.getElementById('finish');
    precisionSelect = document.getElementById('precision');
    toleranceSelect = document.getElementById('tolerance-standard');
    roughnessSelect = document.getElementById('surface-roughness');
    hasThreadRadios = document.querySelectorAll('input[name="has-thread"]');
    hasAssemblyRadios = document.querySelectorAll('input[name="has-assembly-mark"]');
    noteTextarea = document.getElementById('note');
    charCount = document.getElementById('char-count');
    scaleSlider = document.getElementById('scale');
    scaleValue = document.getElementById('scale-value');
    qtyInput = document.getElementById('qty');
    qtyMinus = document.getElementById('qty-minus');
    qtyPlus = document.getElementById('qty-plus');
    dimensionsDisplay = document.getElementById('dimensions-display');
    dimensionsValue = document.getElementById('dimensions-value');
    addToCartBtn = document.getElementById('add-to-cart');
    form = document.getElementById('add-form');

    // 初始化Three.js查看器
    initViewer();

    // 绑定事件
    bindEvents();

    console.log('3D Model Uploader (New) initialized successfully');
  }

  // 初始化Three.js查看器
  function initViewer() {
    if (!viewerContainer) return;

    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);

    // 创建相机
    camera = new THREE.PerspectiveCamera(75, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewerContainer.appendChild(renderer.domElement);

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // 添加控制器
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // 渲染循环
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // 响应式处理
    window.addEventListener('resize', () => {
      const width = viewerContainer.clientWidth;
      const height = viewerContainer.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
  }

  // 绑定事件
  function bindEvents() {
    // 文件上传
    if (fileInput) {
      fileInput.addEventListener('change', handleFileSelect);
    }

    if (dropzone) {
      dropzone.addEventListener('click', () => fileInput?.click());
      dropzone.addEventListener('dragover', handleDragOver);
      dropzone.addEventListener('dragleave', handleDragLeave);
      dropzone.addEventListener('drop', handleDrop);
    }

    // 缩放滑块
    if (scaleSlider && scaleValue) {
      scaleSlider.addEventListener('input', updateScale);
    }

    // 数量控制
    if (qtyMinus) {
      qtyMinus.addEventListener('click', () => updateQuantity(-1));
    }
    if (qtyPlus) {
      qtyPlus.addEventListener('click', () => updateQuantity(1));
    }
    if (qtyInput) {
      qtyInput.addEventListener('change', updateQuantityFromInput);
    }

    // 添加到购物车
    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', handleAddToCart);
    }

    // 材料选择变化
    if (materialSelect) {
      materialSelect.addEventListener('change', updateFormData);
    }

    // 表面处理选择变化
    if (finishSelect) {
      finishSelect.addEventListener('change', updateFormData);
    }

    // 精度选择变化
    if (precisionSelect) {
      precisionSelect.addEventListener('change', updateFormData);
    }

    // 公差标准变化
    if (toleranceSelect) {
      toleranceSelect.addEventListener('change', updateFormData);
    }

    // 表面粗糙度变化
    if (roughnessSelect) {
      roughnessSelect.addEventListener('change', updateFormData);
    }

    // 螺纹选择变化
    hasThreadRadios.forEach(radio => {
      radio.addEventListener('change', updateFormData);
    });

    // 装配标记选择变化
    hasAssemblyRadios.forEach(radio => {
      radio.addEventListener('change', updateFormData);
    });

    // 备注文本变化
    if (noteTextarea) {
      noteTextarea.addEventListener('input', updateCharCount);
      noteTextarea.addEventListener('input', updateFormData);
    }

    // 使删除文件函数全局可用
    window.removeFile = removeFile;
  }

  // 处理文件选择
  function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    processFiles(files);
  }

  // 处理拖拽
  function handleDragOver(event) {
    event.preventDefault();
    dropzone.classList.add('dragover');
  }

  function handleDragLeave(event) {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  }

  function handleDrop(event) {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    const files = Array.from(event.dataTransfer.files);
    processFiles(files);
  }

  // 处理文件
  async function processFiles(files) {
    if (files.length === 0) return;

    showLoading(true);
    hideError();

    try {
      // 验证文件
      const validFiles = files.filter(file => isValidFile(file));
      if (validFiles.length === 0) {
        throw new Error('没有有效的3D模型文件');
      }

      selectedFiles = validFiles;
      console.log('Processing files:', selectedFiles);

      // 加载第一个文件进行预览
      if (validFiles.length > 0) {
        await loadModel(validFiles[0]);
      }

      // 显示文件列表
      displayFileList();

      // 检查是否有3D文件
      const has3DFiles = validFiles.some(f => is3DFile(f.name));
      const has2DFiles = validFiles.some(f => is2DFile(f.name));

      if (has3DFiles) {
        // 启用添加到购物车按钮
        enableAddToCart();
        showSuccess('文件上传成功！请配置右侧参数后下单。');
      } else if (has2DFiles) {
        showWarning('2D文件已接收。为了提供准确的报价和加工服务，请同时上传对应的3D文件（STP/STEP格式）。');
      }

      showLoading(false);
    } catch (error) {
      console.error('Error processing files:', error);
      showError(error.message);
      showLoading(false);
    }
  }

  // 显示文件列表
  function displayFileList() {
    if (!fileList || !fileItems) return;
    
    if (selectedFiles.length === 0) {
      fileList.style.display = 'none';
      return;
    }
    
    fileList.style.display = 'block';
    fileItems.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.innerHTML = `
        <div class="file-info">
          <span class="file-name">${file.name}</span>
          <span class="file-size">${formatFileSize(file.size)}</span>
        </div>
        <button type="button" class="file-remove" onclick="removeFile(${index})">删除</button>
      `;
      fileItems.appendChild(fileItem);
    });
  }

  // 删除文件
  function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFileList();
    
    // 如果没有文件了，禁用添加到购物车按钮
    if (selectedFiles.length === 0) {
      addToCartBtn.disabled = true;
    }
  }

  // 验证文件
  function isValidFile(file) {
    const validExtensions = ['.stl', '.obj', '.step', '.stp', '.3mf', '.iges', '.dwg', '.dxf', '.pdf', '.zip'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    return validExtensions.includes(extension);
  }

  // 检查是否是3D文件
  function is3DFile(fileName) {
    const threeDExtensions = ['.stl', '.obj', '.step', '.stp', '.3mf', '.iges'];
    return threeDExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // 检查是否是2D文件
  function is2DFile(fileName) {
    const twoDExtensions = ['.dwg', '.dxf', '.pdf'];
    return twoDExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // 格式化文件大小
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 加载3D模型
  async function loadModel(file) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.STLLoader();
      
      loader.load(
        URL.createObjectURL(file),
        (geometry) => {
          // 清除之前的模型
          if (currentModel) {
            scene.remove(currentModel);
          }

          // 计算尺寸
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          modelDimensions = {
            width: box.max.x - box.min.x,
            height: box.max.y - box.min.y,
            depth: box.max.z - box.min.z
          };

          // 创建材质
          const material = new THREE.MeshLambertMaterial({ 
            color: 0x888888,
            transparent: true,
            opacity: 0.8
          });

          // 创建网格
          currentModel = new THREE.Mesh(geometry, material);
          currentModel.castShadow = true;
          currentModel.receiveShadow = true;

          // 居中模型
          const center = box.getCenter(new THREE.Vector3());
          currentModel.position.sub(center);

          // 添加到场景
          scene.add(currentModel);

          // 调整相机位置
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          camera.position.set(maxDim * 2, maxDim * 2, maxDim * 2);
          camera.lookAt(0, 0, 0);

          // 更新尺寸显示
          updateDimensionsDisplay();

          // 显示查看器
          showViewer();

          resolve();
        },
        undefined,
        (error) => {
          console.error('Error loading model:', error);
          reject(new Error('无法加载3D模型文件'));
        }
      );
    });
  }

  // 更新尺寸显示
  function updateDimensionsDisplay() {
    if (!dimensionsDisplay || !dimensionsValue) return;

    const scale = parseFloat(scaleSlider?.value || 100) / 100;
    const width = (modelDimensions.width * scale).toFixed(2);
    const height = (modelDimensions.height * scale).toFixed(2);
    const depth = (modelDimensions.depth * scale).toFixed(2);

    dimensionsValue.textContent = `${width} x ${height} x ${depth} 毫米`;
    dimensionsDisplay.style.display = 'block';
  }

  // 更新缩放
  function updateScale() {
    if (!scaleValue || !currentModel) return;

    const scale = parseFloat(scaleSlider.value) / 100;
    scaleValue.textContent = `${scaleSlider.value}%`;

    // 更新模型缩放
    currentModel.scale.setScalar(scale / 100); // 重置到原始大小再应用新缩放

    // 更新尺寸显示
    updateDimensionsDisplay();
  }

  // 更新数量
  function updateQuantity(delta) {
    if (!qtyInput) return;
    
    const currentQty = parseInt(qtyInput.value) || 1;
    const newQty = Math.max(1, currentQty + delta);
    qtyInput.value = newQty;
    updateFormData();
  }

  function updateQuantityFromInput() {
    if (!qtyInput) return;
    
    const qty = parseInt(qtyInput.value) || 1;
    qtyInput.value = Math.max(1, qty);
    updateFormData();
  }

  // 更新字符计数
  function updateCharCount() {
    if (charCount && noteTextarea) {
      charCount.textContent = noteTextarea.value.length;
    }
  }

  // 更新表单数据
  function updateFormData() {
    if (!form) return;

    // 更新单位
    const unitRadios = document.querySelectorAll('input[name="unit"]');
    const selectedUnit = Array.from(unitRadios).find(radio => radio.checked)?.value || 'mm';
    const propUnit = form.querySelector('#prop-unit');
    if (propUnit) propUnit.value = selectedUnit;

    // 更新材料
    const materialInput = form.querySelector('#prop-material');
    if (materialInput && materialSelect) {
      materialInput.value = materialSelect.value;
    }

    // 更新表面处理
    const finishInput = form.querySelector('#prop-finish');
    if (finishInput && finishSelect) {
      finishInput.value = finishSelect.value;
    }

    // 更新精度等级
    const precisionInput = form.querySelector('#prop-precision');
    if (precisionInput && precisionSelect) {
      precisionInput.value = precisionSelect.value;
    }

    // 更新公差标准
    const toleranceInput = form.querySelector('#prop-tolerance');
    if (toleranceInput && toleranceSelect) {
      toleranceInput.value = toleranceSelect.value;
    }

    // 更新表面粗糙度
    const roughnessInput = form.querySelector('#prop-roughness');
    if (roughnessInput && roughnessSelect) {
      roughnessInput.value = roughnessSelect.value;
    }

    // 更新螺纹设置
    const threadRadios = document.querySelectorAll('input[name="has-thread"]');
    const selectedThread = Array.from(threadRadios).find(radio => radio.checked)?.value || 'no';
    const propThread = form.querySelector('#prop-thread');
    if (propThread) propThread.value = selectedThread;

    // 更新装配标记设置
    const assemblyRadios = document.querySelectorAll('input[name="has-assembly-mark"]');
    const selectedAssembly = Array.from(assemblyRadios).find(radio => radio.checked)?.value || 'no';
    const propAssembly = form.querySelector('#prop-assembly');
    if (propAssembly) propAssembly.value = selectedAssembly;

    // 更新缩放
    const scaleInput = form.querySelector('#prop-scale');
    if (scaleInput && scaleSlider) {
      scaleInput.value = scaleSlider.value;
    }

    // 更新数量
    const qtyInput = form.querySelector('#form-qty');
    if (qtyInput && qtyInput) {
      qtyInput.value = qtyInput.value;
    }

    // 更新备注
    const noteInput = form.querySelector('#prop-note');
    if (noteInput && noteTextarea) {
      noteInput.value = noteTextarea.value;
    }

    // 更新尺寸信息
    const dimensionsInput = form.querySelector('#prop-dimensions');
    if (dimensionsInput && dimensionsValue) {
      dimensionsInput.value = dimensionsValue.textContent;
    }
  }

  // 启用添加到购物车按钮
  function enableAddToCart() {
    if (addToCartBtn) {
      addToCartBtn.disabled = false;
    }
  }

  // 处理添加到购物车
  async function handleAddToCart() {
    if (!form || selectedFiles.length === 0) {
      showError('请先上传3D模型文件');
      return;
    }

    try {
      // 更新表单数据
      updateFormData();

      // 检查变体ID
      let idInput = form.querySelector('input[name="id"]');
      if (!idInput || !idInput.value) {
        // 尝试从全局变量获取
        const defaultVariantId = getDefaultVariantId();
        if (defaultVariantId) {
          idInput = document.createElement('input');
          idInput.type = 'hidden';
          idInput.name = 'id';
          idInput.value = defaultVariantId;
          form.appendChild(idInput);
        } else {
          showError('未配置关联商品，无法加入购物车。请在主题编辑器中为该板块选择"关联商品（用于加入购物车）"。');
          return;
        }
      }

      // 准备表单数据
      const formData = new FormData(form);
      
      // 添加文件
      if (selectedFiles.length > 0) {
        formData.append('properties[上传文件]', selectedFiles[0]);
      }

      // 确保数量存在
      if (!formData.get('quantity')) {
        formData.set('quantity', '1');
      }

      // 提交到购物车
      const response = await fetch('/cart/add', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        // 非 JSON 响应时忽略
      }

      if (!response.ok || (data && data.status)) {
        const message = data?.message || '加入购物车失败';
        showError(message);
        return;
      }

      // 成功添加到购物车
      showSuccess('商品已添加到购物车！');

      // 刷新购物车
      refreshCart();

    } catch (error) {
      console.error('Error adding to cart:', error);
      showError('加入购物车时发生错误');
    }
  }

  // 获取默认变体ID
  function getDefaultVariantId() {
    // 从全局变量获取
    if (window.theme && window.theme.defaultVariantId) {
      return window.theme.defaultVariantId;
    }
    
    // 从页面数据获取
    const productData = document.querySelector('[data-product-json]');
    if (productData) {
      try {
        const product = JSON.parse(productData.textContent);
        if (product && product.selected_or_first_available_variant) {
          return product.selected_or_first_available_variant.id.toString();
        }
      } catch (e) {
        console.log('Failed to parse product data:', e);
      }
    }
    
    return null;
  }

  // 刷新购物车
  function refreshCart() {
    // 触发购物车更新事件
    document.dispatchEvent(new CustomEvent('cart:add', { 
      detail: { 
        itemCount: 1,
        sections: {}
      } 
    }));

    // 直接刷新购物车组件
    const cartItemsComponent = document.querySelector('cart-items-component');
    if (cartItemsComponent && typeof cartItemsComponent.renderSection === 'function') {
      cartItemsComponent.renderSection(cartItemsComponent.sectionId, { cache: false });
    }

    // 打开购物车抽屉
    setTimeout(() => {
      const drawer = document.querySelector('cart-drawer-component');
      if (drawer && typeof drawer.open === 'function') {
        drawer.open();
      }
    }, 500);
  }

  // 显示加载状态
  function showLoading(show) {
    if (loadingIndicator) {
      loadingIndicator.style.display = show ? 'block' : 'none';
    }
  }

  // 显示错误
  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
    }
  }

  // 隐藏错误
  function hideError() {
    if (errorMessage) {
      errorMessage.style.display = 'none';
    }
  }

  // 显示成功消息
  function showSuccess(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#4caf50';
      errorMessage.style.backgroundColor = '#e8f5e8';
      errorMessage.style.borderColor = '#4caf50';
      setTimeout(() => hideError(), 3000);
    }
  }

  // 显示警告消息
  function showWarning(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#ff9800';
      errorMessage.style.backgroundColor = '#fff3e0';
      errorMessage.style.borderColor = '#ff9800';
      setTimeout(() => hideError(), 5000);
    }
  }

  // 显示查看器
  function showViewer() {
    if (modelViewer) {
      modelViewer.classList.add('has-model');
    }
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 导出到全局
  window.ModelUploaderNew = {
    init,
    loadModel,
    updateDimensionsDisplay,
    enableAddToCart
  };

})();
