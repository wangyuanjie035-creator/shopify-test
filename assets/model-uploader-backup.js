(function() {
  // @ts-nocheck
  const $ = (sel, ctx=document) => ctx.querySelector(sel);

  // DOM elements will be initialized in init() function
  let unitRadios, unitLabel, scale, scaleLabel, material, finish, precision, postProcessing;
  let dims, qtyInput, addBtn, priceEl, toleranceSelect, roughnessSelect, noteTextarea;
  let hasThreadRadios, hasAssemblyRadios;
  let fileInput, dropzone, fileName, propFile, modelViewer, loadingIndicator, errorMessage;
  let fileList, fileItems, historyTable, historyTbody, form;
  
  // File management
  let selectedFiles = [];
  let uploadHistory = JSON.parse(localStorage.getItem('uploadHistory') || '[]');

  // Settings from Liquid
  const priceBase = Number('{{ section.settings.price_base | default: 1.2 }}');
  let matMul = {};
  let finMul = {};
  try { matMul = JSON.parse(`{{ section.settings.material_multipliers | escape }}`); } catch(e) { matMul = { sls:1, pla:.8, resin:1.4 }; }
  try { finMul = JSON.parse(`{{ section.settings.finish_multipliers | escape }}`); } catch(e) { finMul = { natural:1, polished:1.15, 'dyed-black':1.2 }; }

  function currentUnit() {
    const checked = Array.from(unitRadios).find(r => r.checked);
    return checked ? checked.value : 'mm';
  }

  function toCm(val, unit) {
    // val in unit -> centimeters
    if (!val) return 0;
    const n = Number(val);
    return unit === 'inch' ? n * 2.54 : n / 10; // mm->cm
  }

  function calcPrice() {
    const unit = currentUnit();
    const sx = toCm(dims.x.value, unit);
    const sy = toCm(dims.y.value, unit);
    const sz = toCm(dims.z.value, unit);

    const volume = (sx * sy * sz) * (Number(scale.value) / 100) ** 3; // cm^3
    if (!volume || volume <= 0) {
      priceEl.textContent = '--';
      addBtn.disabled = !propFile.files.length; // still allow add only if file chosen
      return;
    }
    const qty = Math.max(1, Number(qtyInput.value || 1));

    const m = matMul[material.value] ?? 1;
    const f = finMul[finish.value] ?? 1;

    // 精度等级倍率
    const precisionMultipliers = {
      'standard': 1,
      'high': 1.3,
      'ultra': 1.8
    };
    const p = precisionMultipliers[precision?.value] ?? 1;
    
    // 后处理倍率
    const postProcessingMultipliers = {
      'none': 1,
      'polish': 1.2,
      'paint': 1.4,
      'anodize': 1.6
    };
    const pp = postProcessingMultipliers[postProcessing?.value] ?? 1;

    // 螺纹、装配标记附加系数
    const hasThread = Array.from(hasThreadRadios || []).find(r => r.checked)?.value === 'yes';
    const hasAssembly = Array.from(hasAssemblyRadios || []).find(r => r.checked)?.value === 'yes';
    const threadMultiplier = hasThread ? 1.15 : 1.0; // +15%
    const assemblyMultiplier = hasAssembly ? 1.10 : 1.0; // +10%

    const basePrice = volume * priceBase * m * f * p * pp * threadMultiplier * assemblyMultiplier;
    const totalPrice = Math.max(0, basePrice) * qty;
    priceEl.textContent = '¥' + totalPrice.toFixed(2);

    addBtn.disabled = !propFile.files.length; // require file
  }

  // Sync hidden properties before submit
  function syncProps() {
    const propUnit = $('#prop-unit');
    if (propUnit) propUnit.value = currentUnit();
    const propMaterial = $('#prop-material');
    if (propMaterial && material) propMaterial.value = material.options[material.selectedIndex].text;
    
    const propFinish = $('#prop-finish');
    if (propFinish && finish) propFinish.value = finish.options[finish.selectedIndex].text;
    
    const propPrecision = $('#prop-precision');
    if (propPrecision && precision) propPrecision.value = precision.options[precision.selectedIndex]?.text || '';
    
    const propPostProcessing = $('#prop-post-processing');
    if (propPostProcessing && postProcessing) propPostProcessing.value = postProcessing.options[postProcessing.selectedIndex]?.text || '';
    
    const propTolerance = $('#prop-tolerance');
    if (propTolerance && toleranceSelect) propTolerance.value = toleranceSelect.options[toleranceSelect.selectedIndex]?.text || '';
    
    const propRoughness = $('#prop-roughness');
    if (propRoughness && roughnessSelect) propRoughness.value = roughnessSelect.options[roughnessSelect.selectedIndex]?.text || '';
    
    const propHasThread = $('#prop-has-thread');
    if (propHasThread && hasThreadRadios) propHasThread.value = Array.from(hasThreadRadios).find(r => r.checked)?.value === 'yes' ? '是' : '否';
    
    const propHasAssembly = $('#prop-has-assembly');
    if (propHasAssembly && hasAssemblyRadios) propHasAssembly.value = Array.from(hasAssemblyRadios).find(r => r.checked)?.value === 'yes' ? '是' : '否';
    
    const propNote = $('#prop-note');
    if (propNote && noteTextarea) propNote.value = noteTextarea.value || '';
    
    const propDimX = $('#prop-dim-x');
    if (propDimX && dims?.x) propDimX.value = dims.x.value;
    
    const propDimY = $('#prop-dim-y');
    if (propDimY && dims?.y) propDimY.value = dims.y.value;
    
    const propDimZ = $('#prop-dim-z');
    if (propDimZ && dims?.z) propDimZ.value = dims.z.value;
    // 同步体积重量（若存在）
    if (window.__modelMetrics) {
      const propVolume = $('#prop-volume');
      if (propVolume) propVolume.value = String(window.__modelMetrics.volumeCm3 ?? '');
      
      const propWeight = $('#prop-weight');
      if (propWeight) propWeight.value = String(window.__modelMetrics.weightG ?? '');
    }
  }

  // File handling (choose or drag&drop)
  async function setFiles(files) {
    if (!files || files.length === 0) return;
    
    showLoading(true);
    hideError();
    
    try {
      // Validate file count
      if (files.length > 20) {
        throw new Error('单次最多只能上传20个文件');
      }
      
      // Validate file sizes
      for (let file of files) {
        if (file.size > 100 * 1024 * 1024) { // 100MB
          throw new Error(`文件 "${file.name}" 超过100MB限制`);
        }
      }
      
      // Process files
      const processedFiles = [];
      for (let file of files) {
        const processedFile = await processFile(file);
        if (processedFile) {
          processedFiles.push(processedFile);
        }
      }
      
      if (processedFiles.length > 0) {
        selectedFiles = processedFiles;
        displayFileList();
        
        // Add to upload history
        addToHistory(processedFiles);
        
        // Load first 3D model for preview
        const first3DFile = processedFiles.find(f => isSupported3DFile(f.name.toLowerCase()));
        const has2DFiles = processedFiles.some(f => is2DFile(f.name.toLowerCase()));
        
        if (first3DFile) {
          await load3DModel(first3DFile);
        } else if (has2DFiles) {
          // Show special message for 2D files only
          showError('2D文件已接收。为了提供准确的报价和加工服务，请同时上传对应的3D文件（STP/STEP格式）。');
          return;
        }
        
    calcPrice();
      }
    } catch (error) {
      console.error('File processing error:', error);
      showError(error.message);
    } finally {
      showLoading(false);
    }
  }

  // Process uploaded file (handle ZIP extraction)
  async function processFile(file) {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.zip')) {
      return await extractStpFromZip(file);
    } else if (isSupported3DFile(fileName)) {
      // 进一步做内容校验，防止伪造扩展名
      const ok = await validateFileContentSignature(file, fileName);
      if (!ok) {
        throw new Error('文件内容与扩展名不一致。请上传真实的3D模型文件（例如真实的STEP/STL/OBJ等）。');
      }
      return file;
    } else if (is2DFile(fileName)) {
      // 2D文件：接受文件，但在后续阶段如果没有3D文件再提示
      return file;
    } else {
      throw new Error('不支持的文件格式。请上传STP、STL、OBJ、3MF、STEP或IGES文件，或包含这些文件的ZIP压缩包。');
    }
  }

  // Check if file is a supported 3D format
  function isSupported3DFile(fileName) {
    const supportedExtensions = ['.stp', '.step', '.stl', '.obj', '.3mf', '.iges'];
    return supportedExtensions.some(ext => fileName.endsWith(ext));
  }

  // Check if file is a 2D format
  function is2DFile(fileName) {
    const supported2DExtensions = ['.dwg', '.dxf', '.pdf'];
    return supported2DExtensions.some(ext => fileName.endsWith(ext));
  }

  // Validate file content by magic/signature to prevent spoofed extensions
  async function validateFileContentSignature(file, fileName) {
    try {
      const ext = fileName.substring(fileName.lastIndexOf('.'));
      const headBlob = file.slice(0, 512 * 1024); // read first 512KB for text formats
      const buf = await headBlob.arrayBuffer();
      const bytes = new Uint8Array(buf);

      // Helper to decode ASCII safely
      const asText = () => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

      if (ext === '.stl') {
        // STL binary has an 80-byte header then uint32 triangle count
        // ASCII STL starts with 'solid '
        if (bytes.length >= 5) {
          const ascii = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]).toLowerCase();
          if (ascii.startsWith('solid')) return true; // likely ASCII STL
        }
        if (bytes.length >= 84) return true; // likely binary STL
        return false;
      }
      if (ext === '.obj') {
        // OBJ is text and typically contains lines starting with 'v '
        const text = asText();
        return /\nv\s+[-0-9\.]/.test(text);
      }
      if (ext === '.step' || ext === '.stp') {
        // STEP text starts with ISO-10303-21;
        const text = asText();
        return /ISO-10303-21;/.test(text);
      }
      if (ext === '.3mf') {
        // 3MF is a ZIP container; magic of ZIP: 0x50 0x4B 0x03 0x04
        return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
      }
      if (ext === '.iges' || ext === '.igs') {
        const text = asText();
        // IGES has S, G, D, P, T sections; look for global section delimiter
        return /\sS\s*1\s*G\s*/.test(text) || /IGES/i.test(text);
      }
      // default allow if unknown
      return true;
    } catch (e) {
      console.warn('Content validation failed:', e);
      return true; // do not block due to decoder issues
    }
  }

  // Extract STP file from ZIP
  async function extractStpFromZip(zipFile) {
    try {
      // Load JSZip library dynamically
      if (typeof JSZip === 'undefined') {
        await loadJSZip();
      }
      
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);
      
      // Find STP/STEP files in the ZIP
      const stpFiles = [];
      zipContent.forEach((relativePath, file) => {
        if (!file.dir && isSupported3DFile(relativePath.toLowerCase())) {
          stpFiles.push({ path: relativePath, file: file });
        }
      });
      
      if (stpFiles.length === 0) {
        throw new Error('ZIP文件中没有找到支持的3D文件格式（STP、STL、OBJ、3MF、STEP、IGES）。');
      }
      
      if (stpFiles.length > 1) {
        throw new Error(`ZIP文件中找到多个3D文件（${stpFiles.length}个）。请确保ZIP文件中只包含一个3D文件。`);
      }
      
      // Extract the first STP file
      const stpFileData = stpFiles[0];
      const fileContent = await stpFileData.file.async('blob');
      
      // Create a new File object with the extracted content
      const extractedFile = new File([fileContent], stpFileData.path.split('/').pop(), {
        type: getMimeType(stpFileData.path)
      });
      
      return extractedFile;
    } catch (error) {
      if (error.message.includes('ZIP文件中没有找到') || error.message.includes('找到多个3D文件')) {
        throw error;
      }
      throw new Error('ZIP文件解压失败。请确保文件格式正确且未损坏。');
    }
  }

  // Load JSZip library dynamically
  async function loadJSZip() {
    return new Promise((resolve, reject) => {
      if (typeof JSZip !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('无法加载ZIP处理库'));
      document.head.appendChild(script);
    });
  }

  // Get MIME type for file
  function getMimeType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();
    const mimeTypes = {
      'stp': 'application/step',
      'step': 'application/step',
      'stl': 'application/sla',
      'obj': 'application/obj',
      '3mf': 'application/3mf',
      'iges': 'application/iges'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // Load and render 3D model
  async function load3DModel(file) {
    try {
      const fileUrl = URL.createObjectURL(file);
      const fileName = file.name.toLowerCase();
      
      if (modelViewer) {
        // Clear previous model
        modelViewer.innerHTML = '';
        
        // For STP/STEP/IGES try precise parsing first (OCCT), then fallback
        if (fileName.endsWith('.stp') || fileName.endsWith('.step') || fileName.endsWith('.iges') || fileName.endsWith('.igs')) {
          const parsed = await tryParseWithOCCT(file);
          if (!parsed) {
            await renderStpWithThreeJS(fileUrl, file.name);
          }
        } else {
          // For other formats, use model-viewer
          await renderWithModelViewer(fileUrl, file.name);
        }
      }
    } catch (error) {
      console.error('3D模型渲染错误:', error);
      showError('3D模型渲染失败。请检查文件格式是否正确。');
    }
  }

  // Try to parse STEP/IGES precisely using OCCT (occt-import-js)
  async function tryParseWithOCCT(file) {
    // 暂时禁用OCCT功能
    console.log('OCCT解析功能暂时禁用');
    return false;
  }

  // Lazy-load occt-import-js from /assets/occt/
  async function loadOcctImporter() {
    // 暂时禁用OCCT功能
    console.log('OCCT功能暂时禁用');
    return null;
  }

  // Render STP files using Three.js
  async function renderStpWithThreeJS(fileUrl, fileName) {
    try {
      // Load Three.js if not already loaded
      if (typeof THREE === 'undefined') {
        await loadThreeJS();
      }
      
      // Create Three.js scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f5f5);
      
      // Create camera
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      camera.position.set(5, 5, 5);
      
      // Create renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(400, 400);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // Add lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);
      
      // Add controls
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      
      // Create container for Three.js
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '400px';
      container.style.position = 'relative';
      container.appendChild(renderer.domElement);
      
      // Add loading text
      const loadingText = document.createElement('div');
      loadingText.textContent = '正在加载STP文件...';
      loadingText.style.position = 'absolute';
      loadingText.style.top = '50%';
      loadingText.style.left = '50%';
      loadingText.style.transform = 'translate(-50%, -50%)';
      loadingText.style.color = '#666';
      loadingText.style.fontSize = '14px';
      container.appendChild(loadingText);
      
      modelViewer.appendChild(container);
      
      // Try to load STP file (this is a simplified approach)
      // In a real implementation, you would need a proper STP loader
      const loader = new THREE.FileLoader();
      loader.load(fileUrl, (data) => {
        // For now, create a placeholder geometry
        // In production, you would parse the STP data and create proper geometry
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshLambertMaterial({ color: 0x1976d2 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        // 自动尺寸：基于边界盒计算，填入右侧尺寸
        const bbox = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        // 以厘米单位换算到当前单位字段
        fillDimensionsFromBoundingBox(size.x, size.y, size.z, 'cm');
        
        // Remove loading text
        container.removeChild(loadingText);
        
        // Add success message
        const successText = document.createElement('div');
        successText.textContent = `STP文件 "${fileName}" 已加载`;
        successText.style.position = 'absolute';
        successText.style.bottom = '10px';
        successText.style.left = '10px';
        successText.style.color = '#4caf50';
        successText.style.fontSize = '12px';
        successText.style.background = 'rgba(255,255,255,0.8)';
        successText.style.padding = '4px 8px';
        successText.style.borderRadius = '4px';
        container.appendChild(successText);
        
        // Animation loop
        function animate() {
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        }
        animate();
        
      }, undefined, (error) => {
        console.error('STP文件加载失败:', error);
        container.removeChild(loadingText);
        showError('STP文件加载失败。请检查文件格式是否正确。');
      });
      
    } catch (error) {
      console.error('Three.js渲染错误:', error);
      showError('STP文件渲染失败。');
    }
  }

  // Render other formats using model-viewer
  async function renderWithModelViewer(fileUrl, fileName) {
    // Create model-viewer element
    const modelElement = document.createElement('model-viewer');
    modelElement.src = fileUrl;
    modelElement.alt = fileName;
    modelElement.autoRotate = true;
    modelElement.cameraControls = true;
    modelElement.shadowIntensity = 1;
    modelElement.exposure = 1;
    modelElement.style.width = '100%';
    modelElement.style.height = '400px';
    modelElement.style.backgroundColor = '#f5f5f5';
    
    modelViewer.appendChild(modelElement);
    
    // Load model-viewer library if not already loaded
    if (typeof customElements.get('model-viewer') === 'undefined') {
      await loadModelViewer();
    }
    
    // Handle model load events
    modelElement.addEventListener('load', () => {
      console.log('3D模型加载成功');
      try {
        // model-viewer 暴露了getDimensions的能力有限，这里尝试读取scene bounding box
        const scene = modelElement.scene; // experimental
        if (scene && scene.model && scene.model.boundingBox) {
          const b = scene.model.boundingBox;
          const sx = Math.abs(b.max.x - b.min.x);
          const sy = Math.abs(b.max.y - b.min.y);
          const sz = Math.abs(b.max.z - b.min.z);
          // model-viewer单位以米计，转换到厘米
          fillDimensionsFromBoundingBox(sx * 100, sy * 100, sz * 100, 'cm');
        }
      } catch (e) {
        console.warn('自动尺寸填充失败:', e);
      }
    });
    
    modelElement.addEventListener('error', (event) => {
      console.error('3D模型加载失败:', event);
      showError('3D模型加载失败。请检查文件格式是否正确。');
    });
  }

  // Load Three.js library
  async function loadThreeJS() {
    return new Promise((resolve, reject) => {
      if (typeof THREE !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = () => {
        // Load OrbitControls
        const controlsScript = document.createElement('script');
        controlsScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
        controlsScript.onload = resolve;
        controlsScript.onerror = reject;
        document.head.appendChild(controlsScript);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Load model-viewer library dynamically
  async function loadModelViewer() {
    return new Promise((resolve, reject) => {
      if (typeof customElements.get('model-viewer') !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('无法加载3D模型查看器'));
      document.head.appendChild(script);
    });
  }

  // Show/hide loading indicator
  function showLoading(show) {
    if (loadingIndicator) {
      loadingIndicator.style.display = show ? 'block' : 'none';
    }
  }

  // Show error message
  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
    }
  }

  // Hide error message
  function hideError() {
    if (errorMessage) {
      errorMessage.style.display = 'none';
    }
  }

  // Display file list
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
          <div class="file-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
          </div>
          <div class="file-details">
            <div class="file-name">${file.name}</div>
            <div class="file-size">${formatFileSize(file.size)}</div>
          </div>
        </div>
        <button type="button" class="file-remove" onclick="removeFile(${index})">删除</button>
      `;
      fileItems.appendChild(fileItem);
    });
  }

  // Remove file from list
  function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFileList();
    
    if (selectedFiles.length === 0) {
      if (modelViewer) {
        modelViewer.innerHTML = '';
      }
    }
  }

  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Add files to upload history
  function addToHistory(files) {
    const timestamp = new Date().toISOString();
    const historyEntry = {
      id: Date.now(),
      files: files.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type
      })),
      timestamp: timestamp,
      displayTime: new Date(timestamp).toLocaleString('zh-CN')
    };
    
    uploadHistory.unshift(historyEntry);
    
    // Keep only last 50 entries
    if (uploadHistory.length > 50) {
      uploadHistory = uploadHistory.slice(0, 50);
    }
    
    localStorage.setItem('uploadHistory', JSON.stringify(uploadHistory));
    updateHistoryTable();
  }

  // Update history table
  function updateHistoryTable() {
    if (!historyTbody) return;
    
    historyTbody.innerHTML = '';
    
    uploadHistory.forEach((entry, index) => {
      const row = document.createElement('tr');
      row.className = 'history-row';
      
      // Get first 3D file for preview
      const first3DFile = entry.files.find(f => isSupported3DFile(f.name.toLowerCase()));
      
      row.innerHTML = `
        <td class="serial-number">${index + 1}</td>
        <td class="preview-image">
          <div class="preview-thumbnail">
            ${first3DFile ? 
              `<div class="thumbnail-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
                </svg>
              </div>` :
              `<div class="thumbnail-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                </svg>
              </div>`
            }
            <div class="zoom-overlay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5,14H20.5L22,15.5V20.5L20.5,22H15.5L14,20.5V15.5L15.5,14M21,16.5V20.5L20.5,21H16.5L16,20.5V16.5L16.5,16H20.5L21,16.5M12,3A9,9 0 0,1 21,12A9,9 0 0,1 12,21A9,9 0 0,1 3,12A9,9 0 0,1 12,3M12,5A7,7 0 0,0 5,12A7,7 0 0,0 12,19A7,7 0 0,0 19,12A7,7 0 0,0 12,5Z"/>
              </svg>
            </div>
          </div>
        </td>
        <td class="file-name">
          <a href="#" class="file-link" onclick="loadHistoryFile(${entry.id})">
            ${first3DFile ? first3DFile.name : entry.files[0].name}
          </a>
        </td>
        <td class="upload-time">${entry.displayTime}</td>
        <td class="actions">
          <button type="button" class="action-btn action-btn--primary" onclick="orderFromHistory(${entry.id})">立即下单</button>
          <button type="button" class="action-btn action-btn--secondary" onclick="deleteFromHistory(${entry.id})">删除</button>
        </td>
      `;
      
      historyTbody.appendChild(row);
    });
  }

  // Load file from history
  function loadHistoryFile(entryId) {
    const entry = uploadHistory.find(e => e.id === entryId);
    if (entry) {
      // Convert history entry back to File objects (simplified)
      selectedFiles = entry.files.map(f => new File([], f.name, { type: f.type }));
      displayFileList();
    }
  }

  // Order from history
  function orderFromHistory(entryId) {
    const entry = uploadHistory.find(e => e.id === entryId);
    if (entry) {
      selectedFiles = entry.files.map(f => new File([], f.name, { type: f.type }));
      displayFileList();
      // Scroll to upload section
      document.querySelector('.upload-section').scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Delete from history
  function deleteFromHistory(entryId) {
    uploadHistory = uploadHistory.filter(e => e.id !== entryId);
    localStorage.setItem('uploadHistory', JSON.stringify(uploadHistory));
    updateHistoryTable();
  }

  // Initialize event listeners
  function initEventListeners() {
    if (!fileInput || !dropzone) {
      console.error('Required DOM elements not found');
      return;
    }

    // File input and dropzone events
    fileInput.addEventListener('change', e => setFiles(Array.from(e.target.files)));
    
    dropzone.addEventListener('dragover', e => { 
      e.preventDefault(); 
      dropzone.classList.add('drag'); 
    });
    
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag');
      setFiles(Array.from(e.dataTransfer.files));
    });

    // Upload button click
    const btnUpload = $('#btn-upload');
    if (btnUpload) {
      btnUpload.addEventListener('click', () => {
        fileInput.click();
      });
    }

    // Header button events
    $('#btn-demo')?.addEventListener('click', () => {
      alert('操作演示功能：这里可以显示上传和下单的操作流程演示视频或动画。');
    });

    $('#btn-import-parts')?.addEventListener('click', () => {
      alert('导入零件清单功能：这里可以支持批量导入零件清单，自动匹配3D和2D文件。');
    });

    $('#btn-cnc-guide')?.addEventListener('click', () => {
      alert('CNC下单必看：这里可以显示CNC加工的要求、注意事项和下单流程指南。');
    });

    $('#btn-privacy')?.addEventListener('click', () => {
      alert('保密协议：这里可以显示详细的保密协议内容，确保用户了解文件安全保护措施。');
  });

  // UI bindings
  unitRadios.forEach(r => r.addEventListener('change', () => {
      if (unitLabel) unitLabel.textContent = r.value === 'inch' ? '英寸' : '毫米';
    calcPrice();
  }));

    [material, finish, precision, postProcessing, scale, dims.x, dims.y, dims.z, qtyInput, toleranceSelect, roughnessSelect].forEach(el => {
      if (el) {
    el.addEventListener('input', calcPrice);
    el.addEventListener('change', calcPrice);
      }
    });

    hasThreadRadios.forEach(r => r.addEventListener('change', calcPrice));
    hasAssemblyRadios.forEach(r => r.addEventListener('change', calcPrice));

    // 更新备注计数
    if (noteTextarea) {
      noteTextarea.addEventListener('input', () => {
        const c = $('#note-count');
        if (c) c.textContent = String(noteTextarea.value.length);
      });
    }
  }

  function fillDimensionsFromBoundingBox(sizeXcm, sizeYcm, sizeZcm, unitFrom) {
    try {
      let x = sizeXcm, y = sizeYcm, z = sizeZcm; // cm
      const unit = currentUnit();
      // 转换到当前单位输入
      if (unit === 'inch') {
        const cmToInch = v => v / 2.54;
        x = cmToInch(x);
        y = cmToInch(y);
        z = cmToInch(z);
      } else {
        // 毫米
        const cmToMm = v => v * 10;
        x = cmToMm(x); y = cmToMm(y); z = cmToMm(z);
      }
      if (dims.x) dims.x.value = x.toFixed(2);
      if (dims.y) dims.y.value = y.toFixed(2);
      if (dims.z) dims.z.value = z.toFixed(2);
      calcPrice();
    } catch (e) {
      console.warn('填充尺寸失败', e);
    }
  }
    // Additional event listeners
  $('#btn-recent')?.addEventListener('click', () => alert('近期模型：此处可接第三方或自建最近上传列表。'));

  // Scale label
    if (scale && scaleLabel) {
  scale.addEventListener('input', () => scaleLabel.textContent = scale.value + '%');
    }

  // Qty steppers
  document.querySelectorAll('.qty__controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.action === 'inc' ? 1 : -1;
        const next = Math.max(1, Number(qtyInput?.value || 1) + dir);
        if (qtyInput) qtyInput.value = next;
      calcPrice();
    });
  });

    // Add to cart button
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (selectedFiles.length > 0) {
          syncProps();
          if (form) form.submit();
        } else {
          alert('请先选择模型文件。');
        }
      });
    }

  // Submit guard
    if (form) {
  form.addEventListener('submit', e => {
    syncProps();
        if (!propFile?.files.length) {
      e.preventDefault();
      alert('请先上传模型文件。');
        }
      });
    }
  }

  // Initialize
  function init() {
    // Initialize DOM elements
    unitRadios = document.querySelectorAll('input[name="unit"]');
    unitLabel = $('.unit-label');
    scale = $('#scale');
    scaleLabel = $('#scale-label');
    material = $('#material');
    finish = $('#finish');
    precision = $('#precision');
    postProcessing = $('#post-processing');
    dims = { x: $('#dim-x'), y: $('#dim-y'), z: $('#dim-z') };
    qtyInput = $('#qty');
    addBtn = $('#add-to-cart');
    priceEl = $('#price');
    toleranceSelect = $('#tolerance-standard');
    roughnessSelect = $('#surface-roughness');
    noteTextarea = $('#note');
    hasThreadRadios = document.querySelectorAll('input[name="has-thread"]');
    hasAssemblyRadios = document.querySelectorAll('input[name="has-assembly-mark"]');

    fileInput = $('#uploader-input');
    dropzone = $('#dropzone');
    fileName = $('#file-name');
    propFile = $('#prop-file');
    modelViewer = $('#model-viewer');
    loadingIndicator = $('#loading-indicator');
    errorMessage = $('#error-message');
    fileList = $('#file-list');
    fileItems = $('#file-items');
    historyTable = $('#history-table');
    historyTbody = $('#history-tbody');
    form = $('#add-form');

    // Initialize event listeners
    initEventListeners();
    
  calcPrice();
    updateHistoryTable();
    
    // Make functions globally available for onclick handlers
    window.removeFile = removeFile;
    window.loadHistoryFile = loadHistoryFile;
    window.orderFromHistory = orderFromHistory;
    window.deleteFromHistory = deleteFromHistory;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();