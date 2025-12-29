(function() {
  // @ts-nocheck
  const $ = (sel, ctx=document) => ctx.querySelector(sel);

  // DOM elements will be initialized in init() function
  let fileInput, dropzone, modelViewer, loadingIndicator, errorMessage, fileList, fileItems, form;

  // File management
  let selectedFiles = [];

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

  // Process uploaded file
  async function processFile(file) {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.zip')) {
      // For now, just return the ZIP file without extraction
      return file;
    } else if (isSupported3DFile(fileName)) {
      return file;
    } else if (is2DFile(fileName)) {
      // 2D文件：接受文件，但在后续阶段如果没有3D文件再提示
      return file;
    } else {
      throw new Error('不支持的文件格式。请上传STP、STL、OBJ、3MF、STEP或IGES文件，或包含这些文件的ZIP压缩包。');
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
        
        // Check if we have 3D files
        const has3DFiles = processedFiles.some(f => isSupported3DFile(f.name.toLowerCase()));
        const has2DFiles = processedFiles.some(f => is2DFile(f.name.toLowerCase()));
        
        if (has3DFiles) {
          // Show success message
          showError('文件上传成功！请配置右侧参数后下单。');
          setTimeout(() => hideError(), 3000);
        } else if (has2DFiles) {
          // Show special message for 2D files only
          showError('2D文件已接收。为了提供准确的报价和加工服务，请同时上传对应的3D文件（STP/STEP格式）。');
        }
      }
    } catch (error) {
      console.error('File processing error:', error);
      showError(error.message);
    } finally {
      showLoading(false);
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
          <span class="file-name">${file.name}</span>
          <span class="file-size">${formatFileSize(file.size)}</span>
        </div>
        <button type="button" class="file-remove" onclick="removeFile(${index})">删除</button>
      `;
      fileItems.appendChild(fileItem);
    });
  }

  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Remove file from list
  function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFileList();
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

    // Make functions globally available for onclick handlers
    window.removeFile = removeFile;
  }

  // Initialize
  function init() {
    // Initialize DOM elements
    fileInput = $('#uploader-input');
    dropzone = $('#dropzone');
    modelViewer = $('#model-viewer');
    loadingIndicator = $('#loading-indicator');
    errorMessage = $('#error-message');
    fileList = $('#file-list');
    fileItems = $('#file-items');
    form = $('#add-form');

    // Initialize event listeners
    initEventListeners();
    
    console.log('Model uploader initialized successfully');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

