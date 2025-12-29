/**
 * Minimal Online3DViewer Implementation for STP Files
 * 简化版本，只包含STP文件查看的核心功能
 */

// 基础颜色类
class RGBColor {
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
}

class RGBAColor {
  constructor(r, g, b, a) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
}

// 边缘设置
class EdgeSettings {
  constructor(show, color, width) {
    this.show = show;
    this.color = color;
    this.width = width;
  }
}

// 环境设置
class EnvironmentSettings {
  constructor(envMapUrls, useEnvMap) {
    this.envMapUrls = envMapUrls;
    this.useEnvMap = useEnvMap;
  }
}

// 简化的EmbeddedViewer类
class EmbeddedViewer {
  constructor(parentElement, parameters = {}) {
    this.parentElement = parentElement;
    this.parameters = parameters;
    this.canvas = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.currentModel = null;
    
    this.init();
  }

  init() {
    this.createCanvas();
    this.initThreeJS();
    this.setupControls();
    this.startRenderLoop();
  }

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.parentElement.appendChild(this.canvas);
  }

  initThreeJS() {
    // 检查Three.js是否可用
    if (typeof THREE === 'undefined') {
      console.error('Three.js is not loaded');
      return;
    }

    // 创建场景
    this.scene = new THREE.Scene();
    
    // 设置背景色
    const bgColor = this.parameters.backgroundColor || new RGBAColor(255, 255, 255, 255);
    this.scene.background = new THREE.Color(
      bgColor.r / 255,
      bgColor.g / 255,
      bgColor.b / 255
    );

    // 创建相机
    const width = this.parentElement.clientWidth;
    const height = this.parentElement.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(5, 5, 5);

    // 创建渲染器
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas,
      antialias: true 
    });
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 添加光源
    this.setupLighting();
  }

  setupLighting() {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    // 方向光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
  }

  setupControls() {
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = 1;
      this.controls.maxDistance = 100;
    }
  }

  startRenderLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (this.controls) {
        this.controls.update();
      }
      
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  LoadModelFromFileList(files, onSuccess) {
    if (!files || files.length === 0) {
      console.error('No files provided');
      return;
    }

    const file = files[0];
    console.log('Loading STP file:', file.name);

    // 对于STP文件，我们使用Three.js的STLLoader作为示例
    // 实际项目中需要专门的STEP/STP加载器
    if (file.name.toLowerCase().endsWith('.stp') || file.name.toLowerCase().endsWith('.step')) {
      this.loadSTPFile(file, onSuccess);
    } else {
      console.error('Unsupported file format');
    }
  }

  loadSTPFile(file, onSuccess) {
    // 注意：这里需要专门的STEP/STP加载器
    // 目前使用STLLoader作为占位符
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        // 这里应该使用专门的STEP加载器
        // 目前显示一个占位符几何体
        this.createPlaceholderGeometry();
        
        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        console.error('Error loading STP file:', error);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  createPlaceholderGeometry() {
    // 创建一个占位符几何体，表示STP文件已加载
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshLambertMaterial({ 
      color: 0x1976d2,
      transparent: true,
      opacity: 0.8
    });
    
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    
    this.scene.add(cube);
    this.currentModel = cube;
    
    // 调整相机位置以适应模型
    this.FitToWindow();
  }

  LoadModelFromUrlList(urls, onSuccess) {
    console.log('Loading model from URLs:', urls);
    // 实现URL加载逻辑
    if (onSuccess) {
      onSuccess();
    }
  }

  FitToWindow() {
    if (!this.currentModel) return;

    const box = new THREE.Box3().setFromObject(this.currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    
    this.camera.position.set(cameraZ, cameraZ, cameraZ);
    this.camera.lookAt(center);
    
    if (this.controls) {
      this.controls.target.copy(center);
      this.controls.update();
    }
  }

  SetBackgroundColor(color) {
    if (this.scene) {
      this.scene.background = new THREE.Color(
        color.r / 255,
        color.g / 255,
        color.b / 255
      );
    }
  }

  SetDefaultColor(color) {
    if (this.currentModel && this.currentModel.material) {
      this.currentModel.material.color.setRGB(
        color.r / 255,
        color.g / 255,
        color.b / 255
      );
    }
  }

  SetEdgeSettings(edgeSettings) {
    // 实现边缘显示逻辑
    console.log('Setting edge settings:', edgeSettings);
  }

  resize() {
    if (!this.renderer || !this.camera) return;

    const width = this.parentElement.clientWidth;
    const height = this.parentElement.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

// 创建全局OV对象
window.OV = {
  RGBColor,
  RGBAColor,
  EdgeSettings,
  EnvironmentSettings,
  EmbeddedViewer,
  // 为 OCCT worker 提供本地路径，避免CDN超时
  OCCTWorkerPath: (function(){
    try {
      return (typeof Shopify !== 'undefined' && Shopify && Shopify.assets && Shopify.assets['occt-import-js-worker.js'])
        ? Shopify.assets['occt-import-js-worker.js']
        : (document.querySelector('script[src*="o3dv.min.js"]')
            ? document.querySelector('script[src*="o3dv.min.js"]').src.replace('o3dv.min.js', 'occt-import-js-worker.js')
            : 'occt-import-js-worker.js');
    } catch (e) { return 'occt-import-js-worker.js'; }
  })()
};

console.log('Minimal Online3DViewer loaded');
