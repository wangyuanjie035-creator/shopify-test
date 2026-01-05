/**
 * 3D Model Uploader - Complete Multi-File Version
 * 支持多文件独立管理、ZIP解压、完整错误反馈
 */

(function() {
  'use strict';

  // 全局变量
  let fileManager = {
    files: new Map(), // 存储所有文件及其配置
    currentFileId: null, // 当前选中的文件ID
    nextFileId: 1, // 下一个文件ID
    // 文件关联关系：3D文件ID -> 对应的2D文件ID数组
    fileAssociations: new Map()
  };

  let viewer = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  
  // Online3DViewer集成
  let o3dvWrapper = null;
  let useAdvancedViewer = false;

  // DOM 元素
  let fileInput, dropzone, modelViewer, viewerContainer;
  let loadingIndicator, errorMessage, fileList, fileItems;
  let materialSelect, finishSelect, scaleSlider, scaleValue;
  let qtyInput, qtyMinus, qtyPlus;
  let dimensionsDisplay, dimensionsValue;
  let addToCartBtn, form;
  let hasThreadRadios, hasAssemblyRadios, toleranceSelect, roughnessSelect, noteTextarea;
  let precisionSelect, charCount;
  // 批量（选择集）——使用同一个"立即询价"按钮
  const selectedFileIds = new Set();
  let bulkAddBtn = null; // 不再渲染独立按钮，仅保留占位以兼容旧代码

  // 初始化
  function init() {
    console.log('Initializing 3D Model Uploader (Multi-File)...');
    
    // 获取DOM元素
    fileInput = document.getElementById('uploader-input');
    dropzone = document.getElementById('dropzone');
    modelViewer = document.getElementById('model-viewer');
    viewerContainer = document.getElementById('viewer-container');
    loadingIndicator = document.getElementById('loading-indicator');
    
    // 拦截原生的产品表单提交
    interceptNativeProductForms();
    errorMessage = document.getElementById('error-message');
    
    // 初始化Online3DViewer
    initAdvancedViewer();
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

    // 不再创建"批量立即询价"按钮，统一用 addToCartBtn 处理所勾选文件
    bulkAddBtn = null;

    // 初始化3D查看器（若已启用高级查看器，则不再初始化基础Three.js查看器，避免冲突）
    if (!useAdvancedViewer) {
      initViewer();
    }

    // 绑定事件
    bindEvents();

    console.log('3D Model Uploader initialized successfully');
  }

  // 初始化Three.js查看器
  function initViewer() {
    if (!viewerContainer) {
      console.log('Viewer container not found, skipping 3D viewer initialization');
      return;
    }

    // 检查Three.js是否已加载
    if (typeof THREE === 'undefined') {
      console.log('Three.js not loaded, skipping 3D viewer initialization');
      return;
    }

    try {
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

      console.log('3D viewer initialized successfully');
    } catch (error) {
      console.error('Error initializing 3D viewer:', error);
    }
  }

  // 绑定事件
  function bindEvents() {
    console.log('Binding events...');
    
    // 文件上传
    if (fileInput) {
      console.log('File input found, binding change event');
      fileInput.addEventListener('change', handleFileSelect);
    } else {
      console.error('File input not found!');
    }

    if (dropzone) {
      console.log('Dropzone found, binding events');
      dropzone.addEventListener('click', () => {
        console.log('Dropzone clicked, triggering file input');
        if (fileInput) {
          fileInput.click();
        } else {
          console.error('File input not available');
        }
      });
      dropzone.addEventListener('dragover', handleDragOver);
      dropzone.addEventListener('dragleave', handleDragLeave);
      dropzone.addEventListener('drop', handleDrop);
    } else {
      console.error('Dropzone not found!');
    }

    // 参数变化事件
    bindParameterEvents();

    // 添加到购物车
    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', handleAddToCart);
    }

    // 使删除文件函数全局可用
    window.removeFile = removeFile;
    window.selectFile = selectFile;
  }

  // 绑定参数变化事件
  function bindParameterEvents() {
    const parameterElements = [
      materialSelect, finishSelect, precisionSelect, toleranceSelect, roughnessSelect,
      scaleSlider, qtyInput, noteTextarea
    ];

    parameterElements.forEach(element => {
      if (element) {
        if (element.type === 'range' || element.type === 'number') {
          element.addEventListener('input', updateCurrentFileParameters);
        } else {
          element.addEventListener('change', updateCurrentFileParameters);
        }
      }
    });

    // 单选按钮
    hasThreadRadios.forEach(radio => {
      radio.addEventListener('change', updateCurrentFileParameters);
    });

    hasAssemblyRadios.forEach(radio => {
      radio.addEventListener('change', updateCurrentFileParameters);
    });

    // 备注字符计数
    if (noteTextarea) {
      noteTextarea.addEventListener('input', updateCharCount);
    }
  }

  // 处理文件选择
  function handleFileSelect(event) {
    console.log('File select event triggered');
    const files = Array.from(event.target.files);
    console.log('Selected files:', files);
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
    console.log('Dropped files:', files);
    processFiles(files);
  }

  // 处理文件
  async function processFiles(files) {
    if (files.length === 0) return;

    showLoading(true);
    // 不在这里隐藏错误，让验证函数决定是否显示错误

    try {
      let processedCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const file of files) {
        try {
          await processSingleFile(file);
          processedCount++;
        } catch (error) {
          errorCount++;
          errors.push(`${file.name}: ${error.message}`);
        }
      }

      // 显示处理结果
      console.log('processFiles completed, processedCount:', processedCount, 'errorCount:', errorCount);
      if (processedCount > 0) {
        console.log('Calling showSuccess and setTimeout for displayFileList');
        showSuccess(`成功处理 ${processedCount} 个文件！`);
        console.log('showSuccess called, now setting timeout');
        // 延迟显示文件列表，确保DOM元素准备好
        setTimeout(() => {
          console.log('setTimeout callback executed, calling displayFileList');
          displayFileList();
          // 文件列表显示后再验证配置
          if (fileManager.currentFileId) {
            const currentFileData = fileManager.files.get(fileManager.currentFileId);
            if (currentFileData) {
              validateFileConfiguration(currentFileData);
              // 注意：不要在此处无条件启用按钮，保持由验证结果控制
            }
          }
        }, 100);
        // 移除：不要无条件启用立即询价按钮
        // enableAddToCart();
      }

      if (errorCount > 0) {
        showWarning(`有 ${errorCount} 个文件处理失败：\n${errors.join('\n')}`);
      }

      showLoading(false);
    } catch (error) {
      console.error('Error processing files:', error);
      showError(error.message);
      showLoading(false);
    }
  }

  // 处理单个文件
  async function processSingleFile(file) {
    console.log('Processing file:', file.name);

    // 检查STL文件并直接拒绝
    if (file.name.toLowerCase().endsWith('.stl')) {
      throw new Error(`文件"${file.name}"是STL格式，系统仅支持STP/STEP格式文件。STL文件无法转换为STEP文件，请重新导出为STP/STEP格式`);
    }

    // 检查文件类型
    if (file.name.toLowerCase().endsWith('.zip')) {
      return await processZipFile(file);
    } else if (isValidFile(file)) {
      return await processRegularFile(file);
    } else {
      throw new Error('不支持的文件格式，仅支持STP/STEP格式文件以及对应的2D图纸（DWG/DXF/PDF）');
    }
  }

  // 处理ZIP文件
  async function processZipFile(zipFile) {
    return new Promise((resolve, reject) => {
      console.log('Processing ZIP file:', zipFile.name);
      
      const reader = new FileReader();
      
      reader.onload = async function(e) {
        try {
          // 使用JSZip库解压
      if (typeof JSZip === 'undefined') {
            throw new Error('ZIP解压功能需要加载JSZip库，请刷新页面重试');
      }
      
          console.log('Loading ZIP with JSZip...');
      const zip = new JSZip();
          const zipData = await zip.loadAsync(e.target.result);
      
          console.log('ZIP loaded, extracting files...');
          let extractedCount = 0;
      const extractedFiles = [];
          const skippedFiles = [];
      
          // 解压所有文件
          for (const [relativePath, zipEntry] of Object.entries(zipData.files)) {
        if (!zipEntry.dir) {
              if (isValidFileName(relativePath)) {
                try {
                  const fileData = await zipEntry.async('blob');
                  const extractedFile = new File([fileData], relativePath, { type: getMimeType(relativePath) });
                  extractedFiles.push(extractedFile);
                  extractedCount++;
                  console.log('Extracted file:', relativePath);
                } catch (extractError) {
                  console.warn('Failed to extract file:', relativePath, extractError);
                  skippedFiles.push(relativePath);
                }
              } else {
                skippedFiles.push(relativePath);
              }
            }
          }

          console.log(`Extracted ${extractedCount} files, skipped ${skippedFiles.length} files`);

          if (extractedCount === 0) {
            throw new Error(`ZIP文件中没有找到有效的3D模型文件。支持格式：STP, STEP, STL, OBJ, 3MF, IGES, DWG, DXF, PDF`);
          }

          // 处理解压出的文件
          for (const extractedFile of extractedFiles) {
            await processRegularFile(extractedFile);
          }

          // 显示处理结果
          if (skippedFiles.length > 0) {
            showWarning(`ZIP文件处理完成！成功提取 ${extractedCount} 个文件，跳过 ${skippedFiles.length} 个不支持的文件。`);
          } else {
            showSuccess(`ZIP文件处理完成！成功提取 ${extractedCount} 个文件。`);
          }

        resolve();
        } catch (error) {
          console.error('Error processing ZIP:', error);
          reject(error);
        }
      };

      reader.onerror = () => {
        console.error('Failed to read ZIP file');
        reject(new Error('读取ZIP文件失败，请检查文件是否损坏'));
      };
      
      reader.readAsArrayBuffer(zipFile);
    });
  }

  // 处理常规文件
  async function processRegularFile(file) {
    const fileId = fileManager.nextFileId++;
    const fileConfig = createDefaultFileConfig();
    
    // 存储文件
    fileManager.files.set(fileId, {
      id: fileId,
      file: file,
      config: fileConfig,
      dimensions: null,
      model: null
    });

    // 如果是第一个文件，设为当前文件
    if (!fileManager.currentFileId) {
      fileManager.currentFileId = fileId;
      // 立即显示文件列表，不等待3D可视化完成
      setTimeout(() => {
        try { displayFileList(); } catch (_) {}
      }, 50);
      // 异步加载3D模型，不阻塞文件列表显示
      try {
        loadModelForFile(fileId).catch((err) => console.error('Async loadModelForFile error:', err));
      } catch (e) {
        console.error('Failed to start async loadModelForFile:', e);
      }
    }

    return fileId;
  }

  // 创建默认文件配置
  function createDefaultFileConfig() {
    return {
      unit: 'mm',
      material: 'PLA',
      finish: 'Natural',
      precision: 'Standard',
      tolerance: 'GB/T 1804-2000 m级',
      roughness: 'Ra3.2',
      hasThread: 'no',
      hasAssembly: 'no',
      scale: 100,
      quantity: 1,
      note: ''
    };
  }

  // 为文件加载3D模型
  async function loadModelForFile(fileId) {
    const fileData = fileManager.files.get(fileId);
    if (!fileData) return;

    try {
      // 如果是2D文件，不需要加载3D模型，直接显示占位符
      if (is2DFile(fileData.file.name)) {
        console.log('2D file selected, showing placeholder');
        updateDimensionsDisplay();
        showViewerPlaceholder(fileData);
        return;
      }

      // 优先使用高级查看器加载STP/STEP文件
      if (useAdvancedViewer && o3dvWrapper && is3DFile(fileData.file.name)) {
        console.log('Using advanced viewer for STP/STEP file');
        // 如果当前模型相同，直接返回，避免重新加载
        if (o3dvWrapper.currentModel && o3dvWrapper.currentModel.name === fileData.file.name) {
          console.log('Same model already loaded, skipping reload');
          updateDimensionsDisplay();
          return;
        }
        console.log('Calling loadSTPWithAdvancedViewer and waiting for result');
        await loadSTPWithAdvancedViewer(fileData.file);
        console.log('loadSTPWithAdvancedViewer completed');
        return;
      }

      // 如果没有Three.js，使用模拟数据
      if (typeof THREE === 'undefined' || !scene) {
        console.log('Three.js not available, using simulated model data');
        
        // 模拟尺寸数据
        fileData.dimensions = {
          width: 39.0 + Math.random() * 20,
          height: 22.0 + Math.random() * 10,
          depth: 12.75 + Math.random() * 5
        };

        updateDimensionsDisplay();
        showViewerPlaceholder(fileData);
        return;
      }

      // 尝试加载3D模型（基础查看器，仅作占位显示）
      const loader = new THREE.STLLoader();
      
      loader.load(
        URL.createObjectURL(fileData.file),
        (geometry) => {
          // 清除之前的模型
          if (fileData.model) {
            scene.remove(fileData.model);
          }

          // 计算尺寸
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          fileData.dimensions = {
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
          fileData.model = new THREE.Mesh(geometry, material);
          fileData.model.castShadow = true;
          fileData.model.receiveShadow = true;

          // 居中模型
          const center = box.getCenter(new THREE.Vector3());
          fileData.model.position.sub(center);

          // 添加到场景
          scene.add(fileData.model);

          // 调整相机位置
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          camera.position.set(maxDim * 2, maxDim * 2, maxDim * 2);
          camera.lookAt(0, 0, 0);

          // 更新尺寸显示
          updateDimensionsDisplay();

          // 显示查看器
          showViewer();
        },
        undefined,
        (error) => {
          console.error('Error loading model:', error);
          // 使用模拟数据
          fileData.dimensions = {
            width: 39.0 + Math.random() * 20,
            height: 22.0 + Math.random() * 10,
            depth: 12.75 + Math.random() * 5
          };
          updateDimensionsDisplay();
          showViewerPlaceholder(fileData);
        }
      );
    } catch (error) {
      console.error('Error in loadModelForFile:', error);
      // 使用模拟数据
      fileData.dimensions = {
        width: 39.0 + Math.random() * 20,
        height: 22.0 + Math.random() * 10,
        depth: 12.75 + Math.random() * 5
      };
      updateDimensionsDisplay();
      showViewerPlaceholder(fileData);
    }
  }

  // 显示文件列表
  function displayFileList() {
    console.log('displayFileList called, fileManager.files.size:', fileManager.files.size);
    console.log('fileList:', fileList, 'fileItems:', fileItems);
    
    if (!fileList || !fileItems) {
      console.error('fileList or fileItems not found! Retrying in 100ms...');
      // 如果DOM元素不存在，延迟重试
      setTimeout(() => {
        displayFileList();
      }, 100);
      return;
    }
    
    if (fileManager.files.size === 0) {
      console.log('No files, hiding file list');
      fileList.style.display = 'none';
      selectedFileIds.clear();
      updateBulkButtonState();
      return;
    }
    
    console.log('Showing file list with', fileManager.files.size, 'files');
    fileList.style.display = 'block';
    fileItems.innerHTML = '';
    
    // 显示所有文件：3D文件独立显示，2D文件显示在对应3D文件下方，孤儿2D文件也显示
    fileManager.files.forEach((fileData, fileId) => {
      if (is3DFile(fileData.file.name)) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        // 查找对应的2D文件
        const corresponding2DFiles = getCorresponding2DFiles(fileId);
        console.log(`3D文件 ${fileData.file.name} 对应的2D文件:`, corresponding2DFiles.map(f => f.name));
        const has2DIndicator = corresponding2DFiles.length > 0 ? 
          `<div class="file-2d-indicator">📄 已上传2D图纸: ${corresponding2DFiles.map(f => f.name).join(', ')}</div>` : '';
        
        const checkedAttr = selectedFileIds.has(fileId) ? 'checked' : '';
        fileItem.innerHTML = `
            <div class="file-info">
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" ${checkedAttr} onchange="toggleFileSelection(${fileId}, this.checked)">
            <span class="file-name">${fileData.file.name}</span>
          </label>
          <span class="file-size">${formatFileSize(fileData.file.size)}</span>
          ${fileData.dimensions ? `<span class="file-dimensions">${fileData.dimensions.width.toFixed(1)} x ${fileData.dimensions.height.toFixed(1)} x ${fileData.dimensions.depth.toFixed(1)} mm</span>` : ''}
      </div>
            <div class="file-actions">
          <button type="button" class="file-select" onclick="selectFile(${fileId})" ${fileId === fileManager.currentFileId ? 'style="background: #1976d2; color: white;"' : ''}>选择</button>
          <button type="button" class="file-delete" onclick="removeFile(${fileId})">删除</button>
          </div>
          ${has2DIndicator}
        `;
        console.log('Created file item for:', fileData.file.name);
        fileItems.appendChild(fileItem);
        console.log('Appended file item to fileItems, fileItems.children.length:', fileItems.children.length);
      }
    });
    
    // 显示孤儿2D文件（没有对应3D文件的2D文件）
    fileManager.files.forEach((fileData, fileId) => {
      if (is2DFile(fileData.file.name)) {
        // 检查是否有对应的3D文件
        let hasCorresponding3D = false;
        for (const [otherFileId, otherFileData] of fileManager.files) {
          if (otherFileId !== fileId && is3DFile(otherFileData.file.name)) {
            const corresponding2DFiles = getCorresponding2DFiles(otherFileId);
            if (corresponding2DFiles.some(f => f.id === fileId)) {
              hasCorresponding3D = true;
              break;
            }
          }
        }
        
        // 如果没有对应的3D文件，显示这个孤儿2D文件
        if (!hasCorresponding3D) {
          console.log(`孤儿2D文件: ${fileData.file.name}`);
          const fileItem = document.createElement('div');
          fileItem.className = 'file-item orphan-2d';
          fileItem.innerHTML = `
            <div class="file-info">
              <span class="file-name">${fileData.file.name}</span>
              <span class="file-size">${formatFileSize(fileData.file.size)}</span>
              <span class="file-type">2D图纸</span>
            </div>
            <div class="file-actions">
              <button type="button" class="file-select" onclick="selectFile(${fileId})" ${fileId === fileManager.currentFileId ? 'style="background: #1976d2; color: white;"' : ''}>选择</button>
              <button type="button" class="file-delete" onclick="removeFile(${fileId})">删除</button>
            </div>
            <div class="file-warning">⚠️ 此2D文件缺少对应的3D文件</div>
          `;
          fileItems.appendChild(fileItem);
        }
      }
    });
    
    console.log('displayFileList completed, final fileItems.children.length:', fileItems.children.length);
    console.log('fileList.style.display:', fileList.style.display);
    console.log('fileList.offsetHeight:', fileList.offsetHeight);

    // 更新提交按钮状态（基于勾选及校验）
    updateBulkButtonState();
  }

  // 获取对应3D文件的2D文件列表
  function getCorresponding2DFiles(threeDFileId) {
    const threeDFileData = fileManager.files.get(threeDFileId);
    if (!threeDFileData || !is3DFile(threeDFileData.file.name)) {
      return [];
    }

    const corresponding2DFiles = [];
    const baseName = threeDFileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
      .replace(/[_\-\s]+/g, '')
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
    
    for (const [fileId, fileData] of fileManager.files) {
      if (is2DFile(fileData.file.name)) {
        const twoDBaseName = fileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
          .replace(/[_\-\s]+/g, '')
          .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
        
        // 更精确的文件关联匹配
        if (twoDBaseName === baseName || 
            (baseName.length > 3 && twoDBaseName.includes(baseName)) || 
            (twoDBaseName.length > 3 && baseName.includes(twoDBaseName)) ||
            (baseName.length > 5 && twoDBaseName.length > 5 && hasCommonKeywords(baseName, twoDBaseName))) {
          corresponding2DFiles.push({
            id: fileId,
            name: fileData.file.name,
            size: fileData.file.size
          });
        }
      }
    }
    
    return corresponding2DFiles;
  }

  // 选择文件
  function selectFile(fileId) {
    if (!fileManager.files.has(fileId)) return;

    fileManager.currentFileId = fileId;
    const fileData = fileManager.files.get(fileId);
    
    // 更新参数显示
    updateParameterDisplay(fileData.config);
    
    // 加载模型
    loadModelForFile(fileId);
    
    // 验证当前文件配置
    validateFileConfiguration(fileData);
    
    // 更新文件列表显示
    displayFileList();
  }

  // 切换复选框选择
  function toggleFileSelection(fileId, checked) {
    if (!fileManager.files.has(fileId)) return;
    const fileData = fileManager.files.get(fileId);
    if (!is3DFile(fileData.file.name)) return; // 仅3D参与询价
    if (checked) {
      selectedFileIds.add(fileId);
    } else {
      selectedFileIds.delete(fileId);
    }
    updateBulkButtonState();
  }
  window.toggleFileSelection = toggleFileSelection;

  function updateBulkButtonState() {
    // 统一控制 addToCartBtn
    if (!addToCartBtn) return;
    const noneSelected = selectedFileIds.size === 0;
    addToCartBtn.disabled = true;
    if (noneSelected) return;
    // 验证所有选择的文件都满足条件
    const invalid = Array.from(selectedFileIds).some((id) => {
      const fd = fileManager.files.get(id);
      if (!fd) return true;
      if (!is3DFile(fd.file.name)) return true; // 只允许3D
      const need2D = fd.config && (fd.config.hasThread === 'yes' || fd.config.hasAssembly === 'yes');
      return need2D && !hasCorresponding2DFile(id);
    });
    addToCartBtn.disabled = invalid;
  }

  async function handleBulkAddToCart() {
    // 已废弃独立按钮逻辑，改为走 handleAddToCart
    handleAddToCart();
  }

  // 删除文件
  function removeFile(fileId) {
    if (!fileManager.files.has(fileId)) return;

    const fileData = fileManager.files.get(fileId);
    
    // 从场景中移除模型
    if (fileData.model && scene) {
      scene.remove(fileData.model);
    }

    // 从文件管理器中移除
    fileManager.files.delete(fileId);

    // 从批量选择中移除
    selectedFileIds.delete(fileId);

    // 如果删除的是当前文件，选择另一个文件
    if (fileId === fileManager.currentFileId) {
      if (fileManager.files.size > 0) {
        const firstFileId = fileManager.files.keys().next().value;
        selectFile(firstFileId);
      } else {
        fileManager.currentFileId = null;
        clearViewer();
        disableAddToCart();
      }
    }

    displayFileList();
    updateBulkButtonState();
    
    // 重新验证所有文件配置
    if (fileManager.files.size > 0) {
      const currentFileData = fileManager.files.get(fileManager.currentFileId);
      if (currentFileData) {
        validateFileConfiguration(currentFileData);
      }
    } else {
      // 如果没有文件了，隐藏错误消息
      hideError();
    }
  }

  // 更新当前文件的参数
  function updateCurrentFileParameters() {
    if (!fileManager.currentFileId) return;

    const fileData = fileManager.files.get(fileManager.currentFileId);
    if (!fileData) return;

    // 更新配置
    fileData.config.unit = document.querySelector('input[name="unit"]:checked')?.value || 'mm';
    fileData.config.material = materialSelect?.value || 'PLA';
    fileData.config.finish = finishSelect?.value || 'Natural';
    fileData.config.precision = precisionSelect?.value || 'Standard';
    fileData.config.tolerance = toleranceSelect?.value || 'GB/T 1804-2000 m级';
    fileData.config.roughness = roughnessSelect?.value || 'Ra3.2';
    fileData.config.hasThread = document.querySelector('input[name="has-thread"]:checked')?.value || 'no';
    fileData.config.hasAssembly = document.querySelector('input[name="has-assembly-mark"]:checked')?.value || 'no';
    fileData.config.scale = parseFloat(scaleSlider?.value || 100);
    fileData.config.quantity = parseInt(qtyInput?.value || 1);
    fileData.config.note = noteTextarea?.value || '';

    // 执行智能验证（仅用于显示提示）
    validateFileConfiguration(fileData);

    // 更新尺寸显示
    updateDimensionsDisplay();

    // 变更参数后，基于勾选集合重新判断按钮可用
    updateBulkButtonState();
  }

  // 智能验证文件配置
  function validateFileConfiguration(fileData) {
    const warnings = [];
    const errors = [];

    // 检查文件格式 - 只允许STP文件
    if (fileData.file && fileData.file.name.toLowerCase().endsWith('.stl')) {
      const fileName = fileData.file.name;
      errors.push(`❌ 文件"${fileName}"是STL格式，系统仅支持STP/STEP格式文件。STL文件无法转换为STEP文件，请重新导出为STP/STEP格式`);
    }

    // 当选择有螺纹/装配标记时，必须有对应2D
    if (fileData && fileData.config) {
      const need2D = fileData.config.hasThread === 'yes' || fileData.config.hasAssembly === 'yes';
      if (need2D) {
        const has2D = hasCorresponding2DFile(fileManager.currentFileId);
        if (!has2D) {
          const reason = fileData.config.hasThread === 'yes' ? '螺纹' : (fileData.config.hasAssembly === 'yes' ? '装配标记' : '特殊要求');
          errors.push(`❌ 文件"${fileData.file.name}"已选择有${reason}，但缺少对应的2D图纸（DWG/DXF/PDF）`);
        }
      }
    }

    // 尺寸、数量等原有检查保留（若存在）
    
    // 只检查当前选中的3D文件格式
    if (fileManager.currentFileId && fileData.file) {
      if (!isValidFile(fileData.file)) {
        errors.push(`❌ 文件"${fileData.file.name}"格式不支持`);
      }
    }

    // 展示并控制按钮状态
    if (errors.length > 0) {
      showError(errors.join('\n'));
      disableAddToCart();
    } else if (warnings.length > 0) {
      showWarning(warnings.join('\n'));
      // 有警告仍可询价
      enableAddToCart();
    } else {
      hideError();
      enableAddToCart();
    }
  }

  // 检查是否是2D文件
  function is2DFile(fileName) {
    const twoDExtensions = ['.dwg', '.dxf', '.pdf'];
    return twoDExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // 检查是否是3D文件（仅支持STP/STEP格式）
  function is3DFile(fileName) {
    const threeDExtensions = ['.stp', '.step'];
    return threeDExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // 检查3D文件是否有对应的2D文件
  function hasCorresponding2DFile(threeDFileId) {
    const threeDFileData = fileManager.files.get(threeDFileId);
    if (!threeDFileData || !is3DFile(threeDFileData.file.name)) {
      return false;
    }

    // 获取3D文件的基础名称（去掉扩展名和特殊字符）
    const baseName = threeDFileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
      .replace(/[_\-\s]+/g, '') // 移除下划线、连字符、空格
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ''); // 只保留中文、字母、数字
    
    // 检查是否有对应的2D文件
    for (const [fileId, fileData] of fileManager.files) {
      if (is2DFile(fileData.file.name)) {
        const twoDBaseName = fileData.file.name.replace(/\.[^/.]+$/, '').toLowerCase()
          .replace(/[_\-\s]+/g, '') // 移除下划线、连字符、空格
          .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ''); // 只保留中文、字母、数字
        
        // 检查文件名是否匹配（支持多种匹配方式）
        if (twoDBaseName === baseName || 
            twoDBaseName.includes(baseName) || 
            baseName.includes(twoDBaseName) ||
            // 检查是否包含相同的关键词
            hasCommonKeywords(baseName, twoDBaseName)) {
          return true;
        }
      }
    }
    
    return false;
  }

  // 检查两个文件名是否有共同的关键词
  function hasCommonKeywords(name1, name2) {
    // 提取中文关键词
    const chineseWords1 = name1.match(/[\u4e00-\u9fa5]+/g) || [];
    const chineseWords2 = name2.match(/[\u4e00-\u9fa5]+/g) || [];
    
    // 检查是否有共同的中文词
    for (const word1 of chineseWords1) {
      for (const word2 of chineseWords2) {
        if (word1 === word2 && word1.length >= 2) {
          return true;
        }
      }
    }
    
    // 提取英文关键词
    const englishWords1 = name1.match(/[a-z]+/g) || [];
    const englishWords2 = name2.match(/[a-z]+/g) || [];
    
    // 检查是否有共同的英文词
    for (const word1 of englishWords1) {
      for (const word2 of englishWords2) {
        if (word1 === word2 && word1.length >= 3) {
          return true;
        }
      }
    }
    
    return false;
  }

  // 更新参数显示
  function updateParameterDisplay(config) {
    // 更新单位
    const unitRadios = document.querySelectorAll('input[name="unit"]');
    unitRadios.forEach(radio => {
      radio.checked = radio.value === config.unit;
    });

    // 更新其他参数
    if (materialSelect) materialSelect.value = config.material;
    if (finishSelect) finishSelect.value = config.finish;
    if (precisionSelect) precisionSelect.value = config.precision;
    if (toleranceSelect) toleranceSelect.value = config.tolerance;
    if (roughnessSelect) roughnessSelect.value = config.roughness;
    if (scaleSlider) scaleSlider.value = config.scale;
    if (scaleValue) scaleValue.textContent = `${config.scale}%`;
    if (qtyInput) qtyInput.value = config.quantity;
    if (noteTextarea) noteTextarea.value = config.note;

    // 更新单选按钮
    hasThreadRadios.forEach(radio => {
      radio.checked = radio.value === config.hasThread;
    });

    hasAssemblyRadios.forEach(radio => {
      radio.checked = radio.value === config.hasAssembly;
    });

    // 更新字符计数
    updateCharCount();
  }

  // 更新尺寸显示
  function updateDimensionsDisplay() {
    if (!dimensionsDisplay || !dimensionsValue || !fileManager.currentFileId) return;

    const fileData = fileManager.files.get(fileManager.currentFileId);
    if (!fileData || !fileData.dimensions) return;

    const scale = (fileData.config.scale || 100) / 100;
    const width = (fileData.dimensions.width * scale).toFixed(2);
    const height = (fileData.dimensions.height * scale).toFixed(2);
    const depth = (fileData.dimensions.depth * scale).toFixed(2);

    dimensionsValue.textContent = `${width} x ${height} x ${depth} 毫米`;
    dimensionsDisplay.style.display = 'block';
  }

  // 更新字符计数
  function updateCharCount() {
    if (charCount && noteTextarea) {
      charCount.textContent = noteTextarea.value.length;
    }
  }

  // 启用添加到购物车按钮
  function enableAddToCart() {
    if (addToCartBtn) {
      addToCartBtn.disabled = false;
    }
    updateBulkButtonState();
  }

  // 禁用添加到购物车按钮
  function disableAddToCart() {
    if (addToCartBtn) {
      addToCartBtn.disabled = true;
    }
    updateBulkButtonState();
  }

  // 处理询价提交（统一：勾选为前提，提交所勾选文件到草稿订单）
  function handleAddToCart() {
    if (selectedFileIds.size === 0) {
      showError('请先勾选要询价的3D文件');
      updateBulkButtonState();
      return;
    }

    const check = validateFilesSet(selectedFileIds);
    if (!check.ok) {
      showError(check.errors.join('\n'));
      updateBulkButtonState();
      return;
    }

    (async () => {
      // 先进行登录与地址校验
      const ok = await ensureCustomerAuthAndAddress();
      if (!ok) { return; }
      const confirmed = await confirmCustomerInfo();
      if (!confirmed) { return; }
      
      try {
        // 第一步：创建草稿订单
        console.log('📝 创建草稿订单...');
        console.log('选中的文件ID:', Array.from(selectedFileIds));
        
        const draftOrderId = await submitToDraftOrder();
        console.log('submitToDraftOrder 返回结果:', draftOrderId);
        
        if (draftOrderId && draftOrderId.trim() !== '') {
          // 成功创建草稿订单，跳转到草稿订单详情页
          console.log('✅ 草稿订单创建成功，ID:', draftOrderId);
          showSuccessMessage('询价已提交！正在跳转到订单详情...', 2000);
          setTimeout(() => {
            console.log('准备跳转到:', `/pages/my-quotes?id=${encodeURIComponent(draftOrderId)}`);
            window.location.href = `/pages/my-quotes?id=${encodeURIComponent(draftOrderId)}`;
          }, 2000);
        } else {
          console.error('❌ 草稿订单创建失败：未返回有效的订单ID');
          throw new Error('草稿订单创建失败：未返回有效的订单ID');
        }
        
      } catch (e) {
        console.error('❌ Draft order submission failed:', e);
        console.error('❌ 错误堆栈:', e.stack);
        showError('提交询价失败：' + (e && e.message ? e.message : '未知错误'));
      }
    })();
  }

  // 辅助函数：将文件转换为Base64
  async function getFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // 返回完整的Data URL，包括data:前缀
        resolve(reader.result);
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  // 获取第一个文件的数据URL
  async function getFirstFileDataUrl() {
    const firstFileId = Array.from(selectedFileIds)[0];
    if (!firstFileId) return null;
    
    const fileData = fileManager.files.get(firstFileId);
    if (!fileData || !fileData.file) return null;
    
    try {
      return await getFileBase64(fileData.file);
    } catch (error) {
      console.error('获取文件数据失败:', error);
      return null;
    }
  }

  // 提交到草稿订单（第一步：立即询价）
  async function submitToDraftOrder() {
    console.log('📝 开始创建草稿订单...');
    
    // 获取客户信息
    const customerInfo = await getCustomerInfo();
    console.log('客户信息:', customerInfo);
    
    // 准备线上项目（Line Items）
    const lineItems = [];
    
    // 处理每个选中的文件
    for (const fileId of selectedFileIds) {
      const fileData = fileManager.files.get(fileId);
      if (!fileData) continue;
      
      console.log('处理文件:', fileData.file.name);
      
      // 获取文件配置
      const config = fileData.config || {};
      
      // 上传文件到本地存储
      let realFileId = null;
      try {
        if (window.fileStorageManager) {
          realFileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await window.fileStorageManager.uploadFile(fileData.file, realFileId);
          console.log('✅ 文件上传成功，ID:', realFileId);
        } else {
          console.warn('⚠️ 文件存储管理器未加载，使用虚拟文件ID');
          realFileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      } catch (uploadError) {
        console.error('❌ 文件上传失败:', uploadError);
        realFileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      // 创建线上项目（使用虚拟产品）
      lineItems.push({
        title: fileData.file.name,
        quantity: parseInt(config.quantity || 1),
        price: 0, // 初始价格为0，等待报价
        requires_shipping: false,
        customAttributes: [
          { key: 'Order Type', value: '3D Model Quote' },
          { key: '客户姓名', value: customerInfo.name },
          { key: '客户邮箱', value: customerInfo.email },
          { key: '文件大小', value: (fileData.file.size / 1024 / 1024).toFixed(2) + ' MB' },
          { key: '材料', value: config.material || '未指定' },
          { key: '颜色与表面', value: config.finish || '自然色' },
          { key: '精度等级', value: config.precision || '标准 (±0.1mm)' },
          { key: '公差标准', value: config.tolerance || 'GB/T 1804-2000 m级' },
          { key: '表面粗糙度', value: config.roughness || 'Ra3.2' },
          { key: '是否有螺纹', value: config.hasThread || 'no' },
          { key: '是否有装配标记', value: config.hasAssembly || 'no' },
          { key: '缩放比例', value: String(config.scale || 100) },
          { key: '备注', value: config.note || '' },
          { key: 'Quote Status', value: 'Pending' },
          { key: '文件ID', value: realFileId },
          { key: '_uuid', value: Date.now() + '-' + Math.random().toString(36).substr(2, 9) }
        ]
      });
    }
    
    console.log('准备创建草稿订单，线上项目:', lineItems);
    
    // 调用Vercel API创建草稿订单
    const API_BASE = 'https://shopify-13s4.vercel.app/api';
    
    // 获取文件数据
    const fileUrl = lineItems.length > 0 ? await getFirstFileDataUrl() : null;
    console.log('文件数据长度:', fileUrl ? fileUrl.length : 0);
    
    // 获取第一个文件的名称
    const firstFileId = Array.from(selectedFileIds)[0];
    const firstFileName = firstFileId ? fileManager.files.get(firstFileId)?.file?.name : null;
    
    // 验证客户信息
    if (!customerInfo || !customerInfo.email || !customerInfo.name) {
      console.error('❌ 客户信息不完整:', customerInfo);
      throw new Error('客户信息不完整，请确保已正确登录或输入客户信息');
    }
    
    const requestBody = {
      customerName: customerInfo.name,
      customerEmail: customerInfo.email,
      fileName: firstFileName || 'model.stl',
      lineItems: lineItems,
      fileUrl: fileUrl
    };
    
    console.log('📤 请求体准备完成:', {
      customerName: requestBody.customerName,
      customerEmail: requestBody.customerEmail,
      fileName: requestBody.fileName,
      lineItemsCount: requestBody.lineItems.length,
      hasFileData: !!requestBody.fileUrl
    });
    
    const response = await fetch(`${API_BASE}/submit-quote-real`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('API响应状态:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 创建草稿订单失败:', response.status, errorText);
      throw new Error(`创建草稿订单失败: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ 草稿订单创建成功:', result);
    
    if (!result.draftOrderId) {
      console.error('❌ API返回结果中没有draftOrderId:', result);
      throw new Error('API返回结果中没有draftOrderId');
    }
    
    return result.draftOrderId;
  }

  // 提交到购物车（第二步：从草稿订单到购物车）
  async function submitToCart() {
    console.log('🛒 开始添加到购物车...');
    
    // 获取客户信息
    const customerInfo = await getCustomerInfo();
    console.log('客户信息:', customerInfo);
    
    // 准备购物车项目
    const cartItems = [];
    
    // 处理每个选中的文件
    for (const fileId of selectedFileIds) {
      const fileData = fileManager.files.get(fileId);
      if (!fileData) continue;
      
      console.log('处理文件:', fileData.file.name);
      
      // 获取文件配置
      const config = fileData.config || {};
      console.log('文件配置:', config);
      
      // 创建购物车项目
      const cartItem = {
        id: 0, // 虚拟产品ID
        quantity: parseInt(config.quantity || 1),
        properties: {
          'Order Type': '3D Model Quote',
          '客户姓名': customerInfo.name,
          '客户邮箱': customerInfo.email,
          '零件名称': fileData.file.name,
          '文件大小': (fileData.file.size / 1024 / 1024).toFixed(2) + ' MB',
          '材料': config.material || '未指定',
          '颜色': config.finish || '自然色',
          '精度': config.precision || '标准 (±0.1mm)',
          '公差': config.tolerance || 'GB/T 1804-2000 m级',
          '粗糙度': config.roughness || 'Ra3.2',
          '螺纹': config.hasThread || 'no',
          '装配': config.hasAssembly || 'no',
          '缩放': config.scale || 100,
          '备注': config.note || '',
          'Quote Status': 'Pending',
          '_uuid': Date.now() + '-' + Math.random().toString(36).substr(2, 9)
        }
      };
      
      cartItems.push(cartItem);
    }
    
    console.log('准备添加到购物车的项目:', cartItems);
    
    try {
      // 调用Shopify购物车API
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: cartItems
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('购物车API响应错误:', errorText);
        throw new Error(`购物车API调用失败 (${response.status}): ${errorText}`);
      }
      
      const result = await response.json();
      console.log('添加到购物车成功:', result);
      
      // 显示成功消息
      showSuccessMessage('询价提交成功！已添加到购物车。', [
        '1. 您的询价已提交，请在购物车中查看',
        '2. 客服将评估您的需求并报价',
        '3. 报价完成后，您将收到通知',
        '4. 您可以在购物车中查看最新状态'
      ]);
      
      // 延迟跳转到购物车
      setTimeout(() => {
        window.location.href = '/cart';
      }, 3000);
      
    } catch (error) {
      console.error('添加到购物车失败:', error);
      throw error;
    }
  }

  // 提交询价到草稿订单（保留用于管理端功能）
  async function submitQuoteToDraftOrder() {
    const API_BASE = 'https://shopify-13s4.vercel.app/api';  // 请修改为你的实际 Vercel 域名
    
    console.log('开始提交询价到草稿订单...');
    console.log('API_BASE:', API_BASE);
    
    // 获取客户信息
    const customerInfo = await getCustomerInfo();
    console.log('客户信息:', customerInfo);
    
    // 处理每个选中的文件
    for (const fileId of selectedFileIds) {
      const fileData = fileManager.files.get(fileId);
      if (!fileData) continue;
      
      console.log('处理文件:', fileData.file.name);
      
      // 上传文件并获取文件数据
      const fileUrl = await uploadFileToStorage(fileData.file);
      console.log('文件上传成功:', fileUrl ? '已获取URL' : 'Base64数据');
      
      // 获取文件配置
      const config = fileData.config || {};
      console.log('文件配置:', config);
      
      // 准备API请求数据
      const requestData = {
        fileName: fileData.file.name,
        fileData: fileUrl, // 使用文件URL而不是Base64
        customerEmail: customerInfo.email,
        customerName: customerInfo.name,
        quantity: parseInt(config.quantity || 1),
        material: config.material || '未指定',
        color: config.finish || '自然色',
        precision: config.precision || '标准 (±0.1mm)',
        tolerance: config.tolerance || 'GB/T 1804-2000 m级',
        roughness: config.roughness || 'Ra3.2',
        hasThread: config.hasThread || 'no',
        hasAssembly: config.hasAssembly || 'no',
        scale: config.scale || 100,
        note: config.note || ''
      };
      
      console.log('API请求数据:', requestData);
      
      try {
        // 调用草稿订单API
        const response = await fetch(`${API_BASE}/submit-quote-real`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        });
        
        console.log('API响应状态:', response.status);
        console.log('API响应头:', response.headers);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API响应错误:', errorText);
          throw new Error(`API调用失败 (${response.status}): ${errorText}`);
        }
        
      const result = await response.json();
      console.log('API响应结果:', result);

      if (!result.success) {
        throw new Error(result.message || result.error || '提交失败');
      }

      console.log('询价提交成功:', result);
      
      // 显示成功消息和后续步骤
      if (result.nextSteps) {
        showSuccessMessage(result.message, result.nextSteps);
      } else {
        showSuccessMessage(result.message || '询价提交成功！');
      }
      
      // 保存询价单号用于跳转
      if (result.quoteId) {
        window.quoteId = result.quoteId;
      }

    } catch (error) {
        console.error('API调用失败:', error);
        
        // 提供更详细的错误信息
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          throw new Error(`网络连接失败，请检查：
1. 网络连接是否正常
2. API服务是否已部署: ${API_BASE}
3. 域名配置是否正确
4. 是否有防火墙阻止`);
        } else {
          throw error;
        }
      }
    }
    
    // 发送询价通知
    await sendQuoteNotification();
    
    // 延迟跳转，让用户看到成功消息
    setTimeout(() => {
      const quoteId = window.quoteId || 'Q' + Date.now();
      window.location.href = `/pages/my-quotes?id=${quoteId}`;
    }, 3000);
  }

  // 显示成功消息和后续步骤
  function showSuccessMessage(message, nextSteps = []) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 30px;
        max-width: 500px;
        width: 90%;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      ">
        <div style="font-size: 48px; margin-bottom: 20px;">🎉</div>
        <h2 style="color: #28a745; margin-bottom: 20px;">${message}</h2>
        ${nextSteps.length > 0 ? `
          <div style="text-align: left; margin: 20px 0;">
            <h4 style="margin-bottom: 10px;">接下来：</h4>
            <ul style="padding-left: 20px;">
              ${nextSteps.map(step => `<li style="margin-bottom: 8px; color: #666;">${step}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div style="margin-top: 20px; color: #666; font-size: 14px;">
          3秒后自动跳转到询价详情页面...
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 3秒后自动关闭
    setTimeout(() => {
      modal.remove();
    }, 3000);
  }

  // 上传文件到存储并返回URL
  async function uploadFileToStorage(file) {
    try {
      // 如果有文件存储管理器，使用它
      if (window.fileStorageManager) {
        const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        return await window.fileStorageManager.uploadFile(file, fileId);
      }
      
      // 否则转换为Base64
      return await readFileAsBase64(file);
    } catch (error) {
      console.error('文件上传失败:', error);
      throw new Error('文件上传失败: ' + error.message);
    }
  }

  // 读取文件为Base64
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 获取客户信息
  async function getCustomerInfo() {
    console.log('🔍 获取客户信息...');
    console.log('window.customerState:', window.customerState);
    console.log('window.Shopify:', window.Shopify);
    
    // 优先使用 window.customerState 中的信息
    if (window.customerState && window.customerState.loggedIn && window.customerState.email) {
      const email = window.customerState.email.trim().toLowerCase();
      const name = window.customerState.customerName || '客户';
      
      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(email)) {
        console.log('✅ 使用 window.customerState 中的客户信息:', { name, email });
        return { name, email };
      }
    }
    
    // 尝试从Shopify获取客户信息
    if (window.Shopify && window.Shopify.customer) {
      const customer = window.Shopify.customer;
      const email = customer.email || '';
      
      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && emailRegex.test(email)) {
        console.log('✅ 使用 Shopify.customer 中的客户信息:', { 
          name: customer.firstName || 'Shopify客户', 
          email 
        });
        return {
          name: customer.firstName && customer.lastName ? 
                `${customer.firstName} ${customer.lastName}` : 
                customer.firstName || 'Shopify客户',
          email: email
        };
      }
    }
    
    // 如果无法获取或邮箱无效，提示用户输入
    console.log('⚠️ 无法自动获取客户信息，需要手动输入');
    let name, email;
    
    do {
      name = prompt('请输入您的姓名:');
      if (!name) {
        throw new Error('客户姓名不能为空');
      }
    } while (!name.trim());
    
    do {
      email = prompt('请输入您的邮箱地址:');
      if (!email) {
        throw new Error('客户邮箱不能为空');
      }
      
      // 验证邮箱格式
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        alert('邮箱格式不正确，请重新输入');
        email = null;
      }
    } while (!email);
    
    console.log('✅ 使用手动输入的客户信息:', { name: name.trim(), email: email.trim().toLowerCase() });
    return { 
      name: name.trim(), 
      email: email.trim().toLowerCase() 
    };
  }

  // 更新表单数据
  function updateFormData() {
    if (fileManager.files.size === 0) return;

    // 获取当前选中的文件
    const currentFileData = fileManager.files.get(fileManager.currentFileId);
    if (!currentFileData) return;

    // 更新变体ID
    const variantId = getDefaultVariantId();
    if (variantId) {
      const idInput = document.getElementById('product-variant-id') || 
                     document.getElementById('section-variant-id') || 
                     document.getElementById('fallback-variant-id');
      if (idInput) {
        idInput.value = variantId;
      }
    }

    // 更新自定义属性
    const propMaterial = document.getElementById('prop-material');
    const propFinish = document.getElementById('prop-finish');
    const propPrecision = document.getElementById('prop-precision');
    const propTolerance = document.getElementById('prop-tolerance');
    const propRoughness = document.getElementById('prop-roughness');
    const propHasThread = document.getElementById('prop-hasThread');
    const propHasAssembly = document.getElementById('prop-hasAssembly');
    const propScale = document.getElementById('prop-scale');
    const propNote = document.getElementById('prop-note');
    const propFileName = document.getElementById('prop-fileName');
    const propFileSize = document.getElementById('prop-fileSize');

    if (propMaterial) propMaterial.value = currentFileData.config.material || '';
    if (propFinish) propFinish.value = currentFileData.config.finish || '';
    if (propPrecision) propPrecision.value = currentFileData.config.precision || '';
    if (propTolerance) propTolerance.value = currentFileData.config.tolerance || '';
    if (propRoughness) propRoughness.value = currentFileData.config.roughness || '';
    if (propHasThread) propHasThread.value = currentFileData.config.hasThread || '';
    if (propHasAssembly) propHasAssembly.value = currentFileData.config.hasAssembly || '';
    if (propScale) propScale.value = currentFileData.config.scale || 100;
    if (propNote) propNote.value = currentFileData.config.note || '';
    if (propFileName) propFileName.value = currentFileData.file.name;
    if (propFileSize) propFileSize.value = formatFileSize(currentFileData.file.size);

    // 额外：将名称写入隐藏字段（若主题使用表单提交路径时，也能显示名称）
    const ensureHidden = (id, value) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('input');
        el.type = 'hidden';
        el.id = id;
        el.name = `properties[${id}]`;
        form && form.appendChild(el);
      }
      el.value = value;
    };
    ensureHidden('零件名称', currentFileData.file.name);
    ensureHidden('文件名称', currentFileData.file.name);
    ensureHidden('文件名', currentFileData.file.name);
    ensureHidden('名称', currentFileData.file.name);

    console.log('Form data updated for file:', currentFileData.file.name);
  }

  // 上传文件到存储
  async function uploadFileToServer(file, fileId) {
    try {
      // 使用文件存储管理器上传文件
      if (window.fileStorageManager) {
        const fileUrl = await window.fileStorageManager.uploadFile(file, fileId);
        console.log('文件上传成功:', fileUrl);
        return fileUrl;
      } else {
        console.warn('文件存储管理器未加载，使用备用方案');
        return null;
      }
    } catch (error) {
      console.error('文件上传失败:', error);
      // 如果上传失败，返回null，后续会使用备用方案
      return null;
    }
  }

  // 添加单个文件到购物车
  async function addFileToCart(fileId, fileData) {
    // 获取或创建变体ID
    let variantId = getDefaultVariantId();
    
    if (!variantId) {
      variantId = await createDefaultVariant();
    }

    if (!variantId) {
      throw new Error('无法获取产品变体ID，请确保已配置关联商品');
    }

    // 尝试上传文件到服务器
    const fileUrl = await uploadFileToServer(fileData.file, fileId);
    
    // 准备表单数据
    const formData = new FormData();
    formData.append('id', variantId);
    formData.append('quantity', fileData.config.quantity);
    
    // 添加文件（如果上传成功，存储URL；否则存储文件对象）
    if (fileUrl) {
      formData.append('properties[上传文件]', fileUrl);
      formData.append('properties[文件URL]', fileUrl);
    } else {
      formData.append('properties[上传文件]', fileData.file);
    }
    
    // 添加名称（多语言兜底，确保主题能显示其一）
    formData.append('properties[零件名称]', fileData.file.name);
    formData.append('properties[文件名称]', fileData.file.name);
    formData.append('properties[文件名]', fileData.file.name);
    formData.append('properties[名称]', fileData.file.name);
    formData.append('properties[Part Name]', fileData.file.name);
    
    // 其他配置参数（可见）
    formData.append('properties[文件ID]', fileId);
    formData.append('properties[单位]', fileData.config.unit);
    formData.append('properties[材料]', fileData.config.material);
    formData.append('properties[颜色与表面]', fileData.config.finish);
    formData.append('properties[精度等级]', fileData.config.precision);
    formData.append('properties[公差标准]', fileData.config.tolerance);
    formData.append('properties[表面粗糙度]', fileData.config.roughness);
    formData.append('properties[是否有螺纹]', fileData.config.hasThread);
    formData.append('properties[是否有装配标记]', fileData.config.hasAssembly);
    formData.append('properties[缩放比例]', fileData.config.scale);
    formData.append('properties[备注]', fileData.config.note);
    
    if (fileData.dimensions) {
      const scale = fileData.config.scale / 100;
      const dimensions = `${(fileData.dimensions.width * scale).toFixed(2)} x ${(fileData.dimensions.height * scale).toFixed(2)} x ${(fileData.dimensions.depth * scale).toFixed(2)} mm`;
      formData.append('properties[尺寸]', dimensions);
    }
    
    // 业务标记
    formData.append('properties[Order Type]', '3D Model Quote');
    formData.append('properties[Quote Status]', 'Pending');
    formData.append('properties[_uuid]', `${Date.now()}-${fileId}-${Math.random().toString(16).slice(2)}`);
    
    // 添加客户信息
    if (window.customerState && window.customerState.loggedIn) {
      formData.append('properties[客户姓名]', window.customerState.customerName || '登录用户');
      formData.append('properties[客户邮箱]', window.customerState.email || '');
      formData.append('properties[Customer Name]', window.customerState.customerName || '登录用户');
      formData.append('properties[Customer Email]', window.customerState.email || '');
    } else {
      formData.append('properties[客户姓名]', '未登录用户');
      formData.append('properties[客户邮箱]', '');
      formData.append('properties[Customer Name]', '未登录用户');
      formData.append('properties[Customer Email]', '');
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
    try { data = await response.json(); } catch (_) {}

    if (!response.ok || (data && data.status)) {
      const message = data?.message || '加入购物车失败';
      throw new Error(`${fileData.file.name}: ${message}`);
    }

    // 已取消：不再通过 App Proxy 创建，避免重复记录

    // 追加：同步到 Vercel 后端（Metaobject: quote）
    try {
      const base = (window.QUOTES_API_BASE || 'https://shopify-13s4.vercel.app/api').replace(/\/$/, '');
      
      // 确保 API 基础地址正确
      if (!window.QUOTES_API_BASE) {
        console.log('QUOTES_API_BASE not set, using default:', base);
      }
      // 处理文件URL，尝试上传到 Vercel 后端
      let invoiceUrl = formData.get('properties[文件URL]') || '';
      let fileDataBase64 = '';
      
      // 尝试上传文件到 Vercel 后端
      try {
        if (invoiceUrl && invoiceUrl.startsWith('data:')) {
          fileDataBase64 = invoiceUrl;
          console.log('检测到data: URI，尝试上传到后端');
          
          // 上传文件到 Vercel 后端
          const uploadResponse = await fetch(`${base}/upload-file`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Origin': window.location.origin
            },
            body: JSON.stringify({
              fileData: fileDataBase64,
              fileName: fileData.file.name,
              fileType: fileData.file.type,
              orderId: fileData._uuid || `order_${Date.now()}`
            })
          });
          
          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            invoiceUrl = uploadResult.fileUrl;
            console.log('文件上传成功:', uploadResult);
          } else {
            console.warn('文件上传失败，标记为上传失败');
            invoiceUrl = 'data:upload_failed';
          }
        } else if (!invoiceUrl) {
          // 如果没有文件URL，尝试从文件对象生成
          console.log('没有文件URL，尝试生成并上传文件数据');
          try {
            const reader = new FileReader();
            reader.onload = async function(e) {
              fileDataBase64 = e.target.result;
              console.log('文件数据生成成功，尝试上传');
              
              // 上传文件到 Vercel 后端
              try {
                const uploadResponse = await fetch(`${base}/upload-file`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                  },
                  body: JSON.stringify({
                    fileData: fileDataBase64,
                    fileName: fileData.file.name,
                    fileType: fileData.file.type,
                    orderId: fileData._uuid || `order_${Date.now()}`
                  })
                });
                
                if (uploadResponse.ok) {
                  const uploadResult = await uploadResponse.json();
                  invoiceUrl = uploadResult.fileUrl;
                  console.log('文件上传成功:', uploadResult);
                } else {
                  console.warn('文件上传失败，标记为上传失败');
                  invoiceUrl = 'data:upload_failed';
                }
              } catch (uploadError) {
                console.warn('文件上传异常:', uploadError);
                invoiceUrl = 'data:upload_failed';
              }
            };
            reader.readAsDataURL(fileData.file);
            invoiceUrl = 'data:uploading';
          } catch (error) {
            console.warn('生成文件数据失败:', error);
            invoiceUrl = 'data:processing_error';
          }
        } else if (!invoiceUrl.startsWith('http://') && !invoiceUrl.startsWith('https://')) {
          // 如果不是标准URL，使用占位符
          console.log('非标准URL，标记为无效');
          invoiceUrl = 'data:invalid_url';
        }
      } catch (error) {
        console.warn('文件处理异常:', error);
        invoiceUrl = 'data:processing_error';
      }
      
      // 获取客户信息
      let customerName = '客户';
      let customerEmail = '';
      
      // 尝试从多个来源获取客户信息
      if (window.customerState && window.customerState.loggedIn) {
        customerName = window.customerState.customerName || '登录用户';
        customerEmail = window.customerState.email || '';
      } else if (window.Shopify && window.Shopify.customer) {
        customerName = window.Shopify.customer.first_name || 'Shopify客户';
        customerEmail = window.Shopify.customer.email || '';
      } else if (typeof Shopify !== 'undefined' && Shopify.customer) {
        customerName = Shopify.customer.first_name || 'Shopify客户';
        customerEmail = Shopify.customer.email || '';
      } else {
        // 从 URL 参数或 localStorage 获取
        const urlParams = new URLSearchParams(window.location.search);
        customerEmail = urlParams.get('email') || localStorage.getItem('customerEmail') || '';
        customerName = urlParams.get('name') || localStorage.getItem('customerName') || '客户';
      }
      
      const payload = {
        text: fileData.file.name,
        author: `${customerName} (${customerEmail})`,
        email: customerEmail,
        status: 'Pending',
        price: '',
        invoice_url: invoiceUrl
        // 注意：由于 Shopify Metaobject 字段限制，参数信息将合并到 author 字段中
      };
      
      // 确保所有字段都是字符串，并限制长度
      Object.keys(payload).forEach(key => {
        let value = String(payload[key] || '');
        // 限制字段长度，避免超过 2048 字符限制
        if (value.length > 2048) {
          console.warn(`字段 ${key} 长度超限 (${value.length} > 2048)，将被截断`);
          value = value.substring(0, 2048);
        }
        payload[key] = value;
      });
      
      console.log('正在同步到 Vercel 后端:', payload);
      console.log('请求 URL:', `${base}/quotes`);
      console.log('客户信息:', { customerName, customerEmail });
      console.log('window.customerState:', window.customerState);
      console.log('window.Shopify:', window.Shopify);
      
      // 调试：显示每个字段的长度
      Object.keys(payload).forEach(key => {
        console.log(`字段 ${key} 长度: ${payload[key].length} 字符`);
      });
      
      const res = await fetch(`${base}/quotes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify(payload)
      });
      
      console.log('Vercel 后端响应状态:', res.status);
      console.log('响应头:', Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('同步到 Vercel 后端失败：', res.status, errorText);
        console.error('请求数据:', JSON.stringify(payload, null, 2));
        // 显示详细错误给用户
        showNotification(`同步到后台失败 (${res.status}): ${errorText}`, 'error');
      } else {
        const result = await res.text();
        console.log('同步到 Vercel 后端成功:', result);
        showNotification('询价已提交，客服将尽快处理', 'success');
      }
    } catch (err) {
      console.error('同步到 Vercel 后端异常：', err);
      showNotification('网络错误，询价可能未同步到后台', 'warning');
    }
  }

  // 显示通知消息
  function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
    `;
    
    // 根据类型设置样式
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#10b981';
        break;
      case 'error':
        notification.style.backgroundColor = '#ef4444';
        break;
      case 'warning':
        notification.style.backgroundColor = '#f59e0b';
        break;
      default:
        notification.style.backgroundColor = '#3b82f6';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 3秒后自动消失
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // 获取默认变体ID
  function getDefaultVariantId() {
    console.log('Getting default variant ID...');
    
    // 方法1: 优先使用当前产品变体ID（如果是在产品页面）
    if (window.currentProductVariantId) {
      console.log('Using current product variant ID:', window.currentProductVariantId);
      return window.currentProductVariantId;
    }
    
    // 方法2: 从表单获取
    const idInput = form?.querySelector('input[name="id"]');
    if (idInput && idInput.value) {
      console.log('Using form variant ID:', idInput.value);
      return idInput.value;
    }
    
    // 方法3: 从全局变量获取
    if (window.theme && window.theme.defaultVariantId) {
      console.log('Using theme default variant ID:', window.theme.defaultVariantId);
      return window.theme.defaultVariantId;
    }
    
    // 方法4: 从页面数据获取
    const productData = document.querySelector('[data-product-json]');
    if (productData) {
      try {
        const product = JSON.parse(productData.textContent);
        if (product && product.selected_or_first_available_variant) {
          console.log('Using product data variant ID:', product.selected_or_first_available_variant.id);
          return product.selected_or_first_available_variant.id.toString();
        }
      } catch (e) {
        console.log('Failed to parse product data:', e);
      }
    }
    
    console.warn('No variant ID found');
    return null;
  }

  // 创建默认变体
  async function createDefaultVariant() {
    try {
      // 尝试从Shopify全局对象获取
      if (window.Shopify && window.Shopify.theme && window.Shopify.theme.defaultVariantId) {
        return window.Shopify.theme.defaultVariantId;
      }

      // 尝试从URL参数获取
      const urlParams = new URLSearchParams(window.location.search);
      const variantId = urlParams.get('variant');
      if (variantId) {
        return variantId;
      }

      // 尝试从meta标签获取
      const metaVariant = document.querySelector('meta[name="variant-id"]');
      if (metaVariant) {
        return metaVariant.content;
      }

      // 如果都没有，返回一个默认的变体ID（需要根据实际情况调整）
      console.warn('No variant ID found, using fallback');
      return null; // 这里应该返回一个有效的变体ID
    } catch (error) {
      console.error('Error creating default variant:', error);
      return null;
    }
  }

  // 刷新购物车
  async function refreshCart() {
    console.log('Refreshing cart...');
    
    try {
      // 立即获取最新购物车数据
      const response = await fetch('/cart.js');
      const cart = await response.json();
      console.log('Latest cart data:', cart);
      
      // 立即更新UI元素
      updateCartUI(cart);
      
      // 方法1: 触发Shopify标准购物车事件
      document.dispatchEvent(new CustomEvent('cart:add', { 
        detail: { 
          itemCount: cart.item_count,
          sections: {}
        } 
      }));

      // 方法2: 触发Shopify的CartAddEvent
      if (typeof window.CartAddEvent !== 'undefined') {
        document.dispatchEvent(new window.CartAddEvent({
          bubbles: true,
          detail: {
            itemCount: cart.item_count
          }
        }));
      }

      // 方法3: 直接刷新购物车组件
      const cartItemsComponent = document.querySelector('cart-items-component');
      if (cartItemsComponent && typeof cartItemsComponent.renderSection === 'function') {
        console.log('Refreshing cart-items-component...');
        cartItemsComponent.renderSection(cartItemsComponent.sectionId, { cache: false });
      }

      // 方法4: 刷新购物车抽屉
      const cartDrawer = document.querySelector('cart-drawer-component');
      if (cartDrawer) {
        console.log('Refreshing cart-drawer-component...');
        if (typeof cartDrawer.renderSection === 'function') {
          cartDrawer.renderSection(cartDrawer.sectionId, { cache: false });
        }
      }

      // 方法5: 强制刷新购物车抽屉内容
      setTimeout(() => {
        const cartDrawer = document.querySelector('cart-drawer');
        if (cartDrawer) {
          console.log('Force refreshing cart drawer content...');
          
          // 强制重新渲染购物车内容
          const cartItems = cartDrawer.querySelector('cart-items');
          if (cartItems && typeof cartItems.renderSection === 'function') {
            cartItems.renderSection(cartItems.sectionId, { cache: false });
          }
          
          // 更新购物车计数
          const cartCountElements = document.querySelectorAll('.cart-count, [data-cart-count], .cart-count-bubble');
          cartCountElements.forEach(element => {
            if (cart.item_count > 0) {
              element.textContent = cart.item_count;
              element.style.display = 'block';
            }
          });
          
          // 更新购物车总价
          const cartTotalElements = document.querySelectorAll('.cart-total, [data-cart-total]');
          cartTotalElements.forEach(element => {
            element.textContent = formatMoney(cart.total_price);
          });
        }
      }, 50);

      // 打开购物车抽屉
      setTimeout(() => {
        const drawer = document.querySelector('cart-drawer-component');
        if (drawer) {
          console.log('Opening cart drawer...');
          if (typeof drawer.open === 'function') {
            drawer.open();
          } else if (typeof drawer.show === 'function') {
            drawer.show();
          } else {
            // 尝试通过点击购物车图标打开
            const cartIcon = document.querySelector('.cart-icon, [data-cart-icon]');
            if (cartIcon) {
              cartIcon.click();
            }
          }
        }
      }, 100);

      // 额外的购物车刷新机制
      setTimeout(() => {
        console.log('Additional cart refresh...');
        
        // 重新获取购物车数据并更新UI
        fetch('/cart.js')
          .then(response => response.json())
          .then(cart => {
            console.log('Final cart data:', cart);
            
            // 更新所有购物车相关元素
            updateCartUI(cart);
          })
          .catch(error => {
            console.error('Error in final cart refresh:', error);
          });
      }, 500);
      
    } catch (error) {
      console.error('Error refreshing cart:', error);
    }
  }

  // 更新购物车UI
  function updateCartUI(cart) {
    console.log('Updating cart UI with:', cart);
    
    // 更新购物车计数
    const cartCountElements = document.querySelectorAll('.cart-count, [data-cart-count], .cart__count, .cart-count-bubble, .header__icon--cart .cart-count');
    cartCountElements.forEach(element => {
      if (cart.item_count > 0) {
        element.textContent = cart.item_count;
        element.style.display = 'block';
      } else {
        element.style.display = 'none';
      }
    });

    // 更新购物车总价
    const cartTotalElements = document.querySelectorAll('.cart__total, [data-cart-total], .cart-total, .cart-drawer__total');
    cartTotalElements.forEach(element => {
      element.textContent = formatMoney(cart.total_price);
    });

    // 更新购物车状态
    const cartEmptyElements = document.querySelectorAll('.cart-empty, .cart__empty');
    const cartItemsElements = document.querySelectorAll('.cart-items, .cart__items');
    
    if (cart.item_count > 0) {
      cartEmptyElements.forEach(element => {
        element.style.display = 'none';
      });
      cartItemsElements.forEach(element => {
        element.style.display = 'block';
      });
    } else {
      cartEmptyElements.forEach(element => {
        element.style.display = 'block';
      });
      cartItemsElements.forEach(element => {
        element.style.display = 'none';
      });
    }

    // 强制刷新购物车组件
    const cartComponents = document.querySelectorAll('cart-drawer-component, cart-items-component, cart-drawer, cart-items');
    cartComponents.forEach(component => {
      if (component && typeof component.renderSection === 'function') {
        component.renderSection(component.sectionId, { cache: false });
      }
    });

    // 触发购物车更新事件
    document.dispatchEvent(new CustomEvent('cart:updated', {
      detail: { cart: cart }
    }));
    
    // 触发Shopify标准购物车事件
    document.dispatchEvent(new CustomEvent('cart:refresh', {
      detail: { cart: cart }
      }));
    }

  // 格式化货币
  function formatMoney(cents) {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY'
    }).format(cents / 100);
  }

  // 验证文件（支持STP/STEP、ZIP和2D文件）
  function isValidFile(file) {
    const validExtensions = ['.stp', '.step', '.zip', '.dwg', '.dxf', '.pdf'];
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    return validExtensions.includes(extension);
  }

  // 验证文件名（用于ZIP解压，仅支持STP/STEP和2D文件）
  function isValidFileName(fileName) {
    const validExtensions = ['.stp', '.step', '.dwg', '.dxf', '.pdf'];
    return validExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  // 获取MIME类型
  function getMimeType(fileName) {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    const mimeTypes = {
      '.stl': 'application/octet-stream',
      '.obj': 'application/octet-stream',
      '.step': 'application/step',
      '.stp': 'application/step',
      '.3mf': 'application/3mf',
      '.iges': 'application/iges',
      '.dwg': 'application/dwg',
      '.dxf': 'application/dxf',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  // 格式化文件大小
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 显示加载状态
  function showLoading(show) {
    // 使用高级查看器时，将加载提示放到3D窗口中心；底部提示隐藏
    if (useAdvancedViewer && o3dvWrapper) {
      try {
        if (show) {
          o3dvWrapper.showLoading();
        } else {
          o3dvWrapper.hideLoading();
        }
      } catch (e) {}
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      return;
    }
    // 基础模式：仍显示页面底部loading
    if (loadingIndicator) {
      loadingIndicator.style.display = show ? 'block' : 'none';
    }
  }

  // 显示错误（持续显示直到问题解决）
  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#c62828';
      errorMessage.style.backgroundColor = '#ffebee';
      errorMessage.style.borderColor = '#d32f2f';
      errorMessage.style.border = '1px solid #d32f2f';
      errorMessage.style.padding = '12px';
      errorMessage.style.borderRadius = '4px';
      errorMessage.style.margin = '10px 0';
      // 错误消息不自动隐藏，需要手动解决
    }
  }

  // 隐藏错误
  function hideError() {
    if (errorMessage) {
      errorMessage.style.display = 'none';
    }
  }

  // 显示成功消息（自动隐藏）
  function showSuccess(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#4caf50';
      errorMessage.style.backgroundColor = '#e8f5e8';
      errorMessage.style.borderColor = '#4caf50';
      errorMessage.style.border = '1px solid #4caf50';
      errorMessage.style.padding = '12px';
      errorMessage.style.borderRadius = '4px';
      errorMessage.style.margin = '10px 0';
      // 成功消息3秒后自动隐藏
      setTimeout(() => hideError(), 3000);
    }
  }

  // 显示警告消息（持续显示直到问题解决）
  function showWarning(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      errorMessage.style.color = '#ff9800';
      errorMessage.style.backgroundColor = '#fff3e0';
      errorMessage.style.borderColor = '#ff9800';
      errorMessage.style.border = '1px solid #ff9800';
      errorMessage.style.padding = '12px';
      errorMessage.style.borderRadius = '4px';
      errorMessage.style.margin = '10px 0';
      // 警告消息不自动隐藏，需要手动解决
    }
  }

  // 显示查看器
  function showViewer() {
    if (!viewerContainer) return;
    // 如果使用高级查看器，不要重写容器内容，仅标记状态
    if (useAdvancedViewer && o3dvWrapper) {
      if (modelViewer) modelViewer.classList.add('has-model');
      return;
    }
    if (modelViewer) {
      modelViewer.classList.add('has-model');
    }
  }

  // 显示查看器占位符
  function showViewerPlaceholder(fileData) {
    // 若高级查看器启用，则不覆盖容器
    if (useAdvancedViewer && o3dvWrapper) return;
    if (viewerContainer) {
      const is2D = is2DFile(fileData.file.name);
      const iconPath = is2D ? 
        'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' :
        'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z';
      
      viewerContainer.innerHTML = `
        <div style="text-align: center; color: #666;">
          <div style="width: 100px; height: 100px; background: #e0e0e0; border-radius: 8px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="${iconPath}"></path>
            </svg>
          </div>
          <p>${is2D ? '2D图纸已加载' : '3D模型已加载'}</p>
          ${fileData.dimensions ? `<p style="font-size: 12px; color: #999;">尺寸: ${fileData.dimensions.width.toFixed(1)} x ${fileData.dimensions.height.toFixed(1)} x ${fileData.dimensions.depth.toFixed(1)} mm</p>` : ''}
        </div>
      `;
    }
  }

  // 清除查看器
  function clearViewer() {
    if (viewerContainer) {
      // 如果使用高级查看器，不要覆盖容器，而是隐藏加载指示器
      if (useAdvancedViewer && o3dvWrapper) {
        o3dvWrapper.hideLoadingSafely();
        // 确保查看器容器显示占位符
        const placeholder = viewerContainer.querySelector('.viewer-placeholder');
        if (placeholder) {
          placeholder.style.display = 'block';
        }
        return;
      }
      
      // 基础查看器：恢复原始占位符
      viewerContainer.innerHTML = `
        <div class="viewer-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27,6.96 12,12.01 20.73,6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <p>上传3D模型文件以查看预览</p>
        </div>
      `;
    }
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 拦截原生的产品表单提交
  function interceptNativeProductForms() {
    // 拦截所有原生的产品表单提交
    document.addEventListener('submit', function(event) {
      const form = event.target;
      
      // 检查是否是原生的产品表单（不是我们的自定义表单）
      if (form.action && form.action.includes('/cart/add') && form.id !== 'add-form') {
        console.log('Intercepting native product form submission');
        
        // 检查是否有验证错误
        if (fileManager.files.size === 0) {
          event.preventDefault();
          showError('请先上传3D模型文件');
          return false;
        }
        
        // 检查当前文件是否有错误
        const currentFileData = fileManager.files.get(fileManager.currentFileId);
        if (currentFileData) {
          validateFileConfiguration(currentFileData);
          
          // 如果按钮被禁用，说明有错误
          const addToCartBtn = document.getElementById('add-to-cart');
          if (addToCartBtn && addToCartBtn.disabled) {
            event.preventDefault();
            console.log('Blocked native form submission due to validation errors');
            return false;
          }
        }
      }
    });
    
    // 拦截原生的添加到购物车按钮点击
    document.addEventListener('click', function(event) {
      const button = event.target.closest('button');
      if (button && button.type === 'submit' && button.form && button.form.action && button.form.action.includes('/cart/add') && button.form.id !== 'add-form') {
        console.log('Intercepting native add to cart button click');
        
        // 检查是否有验证错误
        if (fileManager.files.size === 0) {
          event.preventDefault();
          showError('请先上传3D模型文件');
          return false;
        }
        
        // 检查当前文件是否有错误
        const currentFileData = fileManager.files.get(fileManager.currentFileId);
        if (currentFileData) {
          validateFileConfiguration(currentFileData);
          
          // 如果按钮被禁用，说明有错误
          const addToCartBtn = document.getElementById('add-to-cart');
          if (addToCartBtn && addToCartBtn.disabled) {
            event.preventDefault();
            console.log('Blocked native button click due to validation errors');
            return false;
          }
        }
      }
    });
  }

  // ==================== Online3DViewer集成函数 ====================

  // 初始化高级3D查看器
  function initAdvancedViewer() {
    console.log('Initializing Advanced 3D Viewer...');
    
    // 检查是否可以使用Online3DViewer
    if (typeof O3DVWrapper !== 'undefined' && typeof OV !== 'undefined') {
      try {
        o3dvWrapper = new O3DVWrapper('viewer-container', {
          width: 800,
          height: 600,
          backgroundColor: { r: 248, g: 249, b: 250, a: 255 },
          defaultColor: { r: 25, g: 118, b: 210 },
          showEdges: false
        });
        
        useAdvancedViewer = true;
        console.log('Advanced 3D Viewer initialized successfully');
        
        // 添加查看器控制按钮
        addViewerControls();
        
      } catch (error) {
        console.error('Failed to initialize Advanced 3D Viewer:', error);
        useAdvancedViewer = false;
        // 回退到基础Three.js查看器
        initViewer();
      }
    } else {
      console.log('O3DV not available, using basic viewer');
      useAdvancedViewer = false;
      // 回退到基础Three.js查看器
      initViewer();
    }
  }

  // 添加查看器控制按钮
  function addViewerControls() {
    if (!viewerContainer || !o3dvWrapper) return;

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'viewer-controls';
    controlsContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      display: flex;
      gap: 8px;
      flex-direction: column;
    `;

    // 重置视图按钮
    const resetBtn = createControlButton('重置视图', '🔄', () => {
      o3dvWrapper.resetView();
    });

    // 测量按钮
    const measureBtn = createControlButton('测量', '📏', () => {
      o3dvWrapper.enableMeasurement();
    });

    // 标注按钮
    const annotateBtn = createControlButton('标注', '📝', () => {
      o3dvWrapper.enableAnnotation();
    });

    // 导出按钮
    const exportBtn = createControlButton('导出', '💾', () => {
      o3dvWrapper.exportModel('stl');
    });

    controlsContainer.appendChild(resetBtn);
    controlsContainer.appendChild(measureBtn);
    controlsContainer.appendChild(annotateBtn);
    controlsContainer.appendChild(exportBtn);

    viewerContainer.appendChild(controlsContainer);
  }

  // 创建控制按钮
  function createControlButton(text, icon, onClick) {
    const button = document.createElement('button');
    button.innerHTML = `${icon} ${text}`;
    button.style.cssText = `
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(25, 118, 210, 0.1)';
      button.style.borderColor = '#1976d2';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(255, 255, 255, 0.9)';
      button.style.borderColor = '#ddd';
    });
    
    button.addEventListener('click', onClick);
    
    return button;
  }

  // 使用高级查看器加载STP文件
  function loadSTPWithAdvancedViewer(file) {
    console.log('loadSTPWithAdvancedViewer called for file:', file.name);
    if (!o3dvWrapper || !useAdvancedViewer) {
      console.log('Advanced viewer not available, using basic viewer');
      return loadModelForFile(fileManager.currentFileId);
    }

    // 检查高级查看器是否仍然有效
    if (!o3dvWrapper.isInitialized) {
      console.log('Advanced viewer not initialized, reinitializing...');
      try {
        o3dvWrapper.init();
      } catch (error) {
        console.error('Failed to reinitialize advanced viewer:', error);
        useAdvancedViewer = false;
        initViewer();
        return loadModelForFile(fileManager.currentFileId);
      }
    }

    console.log('About to call o3dvWrapper.loadSTPFile for:', file.name);
    return o3dvWrapper.loadSTPFile(file)
      .then(() => {
        console.log('STP/STEP file loaded with advanced viewer:', file.name);
        // 更新尺寸显示
        updateDimensionsDisplay();
        // 确保所有加载指示器都隐藏
        clearLoadingAndPlaceholder();
      })
      .catch(error => {
        console.error('Failed to load STP with advanced viewer:', file.name, error);
        // 确保所有加载指示器都隐藏
        clearLoadingAndPlaceholder();
        // 回退到基本查看器
        useAdvancedViewer = false;
        initViewer();
        return loadModelForFile(fileManager.currentFileId);
      });
  }

  // 切换查看器模式
  function toggleViewerMode() {
    if (!o3dvWrapper) return;

    useAdvancedViewer = !useAdvancedViewer;
    
    if (useAdvancedViewer) {
      console.log('Switched to advanced viewer');
      // 隐藏基本查看器，显示高级查看器
      if (viewerContainer) {
        const basicViewer = viewerContainer.querySelector('.viewer-placeholder');
        if (basicViewer) {
          basicViewer.style.display = 'none';
        }
      }
  } else {
      console.log('Switched to basic viewer');
      // 显示基本查看器，隐藏高级查看器
      if (viewerContainer) {
        const basicViewer = viewerContainer.querySelector('.viewer-placeholder');
        if (basicViewer) {
          basicViewer.style.display = 'block';
        }
      }
    }
  }

  // 获取查看器信息
  function getViewerInfo() {
    if (o3dvWrapper) {
      return o3dvWrapper.getModelInfo();
    }
    return null;
  }

  // ==================== Online3DViewer集成函数结束 ====================

  // 导出到全局
  window.ModelUploader = {
    init,
    fileManager,
    selectFile,
    removeFile,
    enableAddToCart,
    // Online3DViewer集成功能
    loadSTPWithAdvancedViewer,
    toggleViewerMode,
    getViewerInfo,
    o3dvWrapper: () => o3dvWrapper
  };

  // ============== 登录与地址校验 ==============
  function ensureCustomerAuthAndAddress() {
    return new Promise((resolve) => {
      // 检查是否有管理员登录
      if (window.loginManager && window.loginManager.hasAdminAccess()) {
        showError('检测到管理员已登录，请先退出管理员登录后再进行客户操作');
        resolve(false);
        return;
      }
      
      const state = (window.customerState) || { loggedIn: false, hasAddress: false };
      
      // 如果客户已登录且有地址信息，记录到登录管理系统
      if (state.loggedIn && state.hasAddress) {
        if (window.loginManager) {
          window.loginManager.customerLogin({
            email: state.email,
            name: state.customerName || '客户',
            hasAddress: state.hasAddress
          });
        }
        resolve(true);
        return;
      }

      // 构建轻量弹窗
      const overlayId = 'auth-address-overlay';
      if (document.getElementById(overlayId)) { document.getElementById(overlayId).remove(); }
      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:min(520px,90vw);background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);overflow:hidden;';
      const header = document.createElement('div');
      header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #eee;font-weight:600;';
      header.textContent = '完成账户信息后继续';
      const body = document.createElement('div');
      body.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:12px;font-size:14px;color:#333;';
      const actions = document.createElement('div');
      actions.style.cssText = 'padding:14px 20px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;';

      const needLogin = !state.loggedIn;
      const needAddress = !state.hasAddress;
      if (needLogin) {
        const p = document.createElement('div');
        p.innerHTML = '您还未登录，请先登录账户。';
        body.appendChild(p);
      }
      if (needAddress) {
        const p = document.createElement('div');
        p.innerHTML = '请先添加账单地址，以便我们处理询价和后续沟通。';
        body.appendChild(p);
      }

      const btnCancel = document.createElement('button');
      btnCancel.textContent = '稍后再说';
      btnCancel.style.cssText = 'background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnCancel.onclick = () => { document.body.removeChild(overlay); resolve(false); };

      const btnPrimary = document.createElement('button');
      btnPrimary.textContent = '去完善信息';
      btnPrimary.style.cssText = 'background:#1976d2;color:#fff;border:1px solid #1976d2;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnPrimary.onclick = () => {
        // 优先引导到登录或地址页
        if (needLogin) {
          window.location.href = '/account/login?return_url=' + encodeURIComponent(window.location.pathname + window.location.search + '#resumeQuote');
        } else if (needAddress) {
          // 跳到账户地址管理页
          window.location.href = '/account/addresses?return_url=' + encodeURIComponent(window.location.pathname + window.location.search + '#resumeQuote');
        }
        resolve(false);
      };

      actions.appendChild(btnCancel);
      actions.appendChild(btnPrimary);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); } });
      document.body.appendChild(overlay);
    });
  }

  // 展示信息确认弹窗
  function confirmCustomerInfo() {
    return new Promise((resolve) => {
      const state = (window.customerState) || { loggedIn: false, hasAddress: false };
      // 若仍不满足条件，直接拒绝
      if (!state.loggedIn || !state.hasAddress) { resolve(false); return; }

      const overlayId = 'confirm-info-overlay';
      if (document.getElementById(overlayId)) { document.getElementById(overlayId).remove(); }
      const overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:min(560px,92vw);background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);overflow:hidden;';
      const header = document.createElement('div');
      header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #eee;font-weight:600;';
      header.textContent = '确认信息';
      const body = document.createElement('div');
      body.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:12px;font-size:14px;color:#333;';

      const email = document.createElement('div');
      email.innerHTML = '<strong>邮箱：</strong>' + (state.email || '—');
      body.appendChild(email);

      const addr = state.address || {};
      const addressBlock = document.createElement('div');
      addressBlock.innerHTML = '<strong>账单地址：</strong>' +
        [addr.first_name, addr.last_name].filter(Boolean).join(' ') + ' ' +
        [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean).join('，');
      body.appendChild(addressBlock);

      const tip = document.createElement('div');
      tip.style.cssText = 'font-size:12px;color:#666;';
      tip.textContent = '请确认以上信息准确无误，点击“确认信息”后将提交询价到购物车。';
      body.appendChild(tip);

      const actions = document.createElement('div');
      actions.style.cssText = 'padding:14px 20px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;';
      const btnBack = document.createElement('button');
      btnBack.textContent = '返回修改';
      btnBack.style.cssText = 'background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnBack.onclick = () => { document.body.removeChild(overlay); resolve(false); };

      const btnOk = document.createElement('button');
      btnOk.textContent = '确认信息';
      btnOk.style.cssText = 'background:#1976d2;color:#fff;border:1px solid #1976d2;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btnOk.onclick = () => { document.body.removeChild(overlay); resolve(true); };

      actions.appendChild(btnBack);
      actions.appendChild(btnOk);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); } });
      document.body.appendChild(overlay);
    });
  }

  // 校验一组文件（传入集合，若不传则校验全部）
  function validateFilesSet(fileIdIterable) {
    const ids = fileIdIterable ? Array.from(fileIdIterable) : Array.from(fileManager.files.keys());
    const errors = [];
    for (const id of ids) {
      const fd = fileManager.files.get(id);
      if (!fd) { errors.push(`文件ID ${id} 不存在`); continue; }
      if (!isValidFile(fd.file)) { errors.push(`❌ 文件"${fd.file.name}"格式不支持`); }
      if (!is3DFile(fd.file.name)) { continue; }
      const need2D = fd.config && (fd.config.hasThread === 'yes' || fd.config.hasAssembly === 'yes');
      if (need2D && !hasCorresponding2DFile(id)) {
        const reason = fd.config.hasThread === 'yes' ? '螺纹' : (fd.config.hasAssembly === 'yes' ? '装配标记' : '特殊要求');
        errors.push(`❌ 文件"${fd.file.name}"已选择有${reason}，但缺少对应的2D图纸（DWG/DXF/PDF）`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // ===== 报价面板（全屏独立界面） =====
  function ensureQuotePanel() {
    if (document.getElementById('quote-panel-overlay')) return;
    const style = document.createElement('style');
    style.textContent = `
      #quote-panel-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:10000}
      #quote-panel{position:fixed;inset:5% 10%;background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;z-index:10001}
      #quote-panel-header{padding:16px 20px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between}
      #quote-panel-title{font-size:18px;font-weight:600}
      #quote-panel-close{border:none;background:#f5f5f5;border-radius:6px;padding:8px 12px;cursor:pointer}
      #quote-panel-body{padding:16px 20px;overflow:auto}
      .quote-item{border:1px solid #eee;border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
      .quote-left{display:flex;flex-direction:column;gap:6px}
      .quote-name{font-weight:600}
      .quote-meta{font-size:12px;color:#666}
      .quote-status{color:#1976d2;background:rgba(25,118,210,.08);padding:6px 10px;border-radius:999px;font-size:12px}
    `;
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'quote-panel-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeQuotePanel(); });
    const panel = document.createElement('div');
    panel.id = 'quote-panel';
    panel.innerHTML = `
      <div id="quote-panel-header">
        <div id="quote-panel-title">询价明细</div>
        <div>
          <button id="quote-panel-close">关闭</button>
        </div>
      </div>
      <div id="quote-panel-body"></div>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.getElementById('quote-panel-close').addEventListener('click', closeQuotePanel);
  }

  function renderQuotePanel(fileIds) {
    ensureQuotePanel();
    const body = document.getElementById('quote-panel-body');
    if (!body) return;
    body.innerHTML = '';
    const ids = Array.from(fileIds);
    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '未勾选文件';
      body.appendChild(empty);
      return;
    }
    ids.forEach((id) => {
      const fd = fileManager.files.get(id);
      if (!fd) return;
      const div = document.createElement('div');
      div.className = 'quote-item';
      div.innerHTML = `
        <div class="quote-left">
          <div class="quote-name">${fd.file.name}</div>
          <div class="quote-meta">数量: ${fd.config.quantity || 1} ｜ 材料: ${fd.config.material || ''} ｜ 精度: ${fd.config.precision || ''}</div>
        </div>
        <div class="quote-status">报价中</div>
      `;
      body.appendChild(div);
    });
  }

  function openQuotePanel(fileIds) {
    ensureQuotePanel();
    renderQuotePanel(fileIds);
    const overlay = document.getElementById('quote-panel-overlay');
    if (overlay) overlay.style.display = 'block';
  }
  function closeQuotePanel() {
    const overlay = document.getElementById('quote-panel-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // 发送询价通知
  async function sendQuoteNotification() {
    try {
      // 收集询价数据
      const orderData = {
        uuid: `${Date.now()}-${selectedFileIds.size}-${Math.random().toString(16).slice(2)}`,
        customer: window.customerState?.customerName || '未知客户',
        email: window.customerState?.email || '',
        phone: window.customerState?.phone || '',
        files: Array.from(selectedFileIds).map(id => {
          const fd = fileManager.files.get(id);
          return fd ? fd.file.name : '未知文件';
        }).join(', '),
        fileType: '3D模型',
        uploadTime: new Date().toLocaleString('zh-CN'),
        quantity: 1,
        material: '待确认',
        precision: '待确认',
        finish: '待确认',
        scale: 100,
        note: '客户询价请求'
      };

      // 发送邮件通知
      if (window.emailNotificationSystem) {
        await window.emailNotificationSystem.sendQuoteNotification(orderData);
        await window.emailNotificationSystem.sendInternalNotification(orderData);
      }

      console.log('询价通知已发送:', orderData);
    } catch (error) {
      console.error('发送询价通知失败:', error);
    }
  }
})();