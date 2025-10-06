const fs = require('fs');
const path = require('path');

// SVG内容
const svgContent = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- 背景 -->
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  
  <!-- 画布背景 -->
  <rect x="20" y="20" width="88" height="88" rx="8" fill="white" opacity="0.9"/>
  
  <!-- 网格 -->
  <defs>
    <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect x="20" y="20" width="88" height="88" fill="url(#grid)" opacity="0.3"/>
  
  <!-- 示例图形 -->
  <!-- 圆形 -->
  <circle cx="45" cy="45" r="12" fill="#3498db" stroke="#2c3e50" stroke-width="2"/>
  
  <!-- 矩形 -->
  <rect x="65" y="33" width="24" height="16" fill="#e74c3c" stroke="#c0392b" stroke-width="2"/>
  
  <!-- 三角形 -->
  <polygon points="45,75 57,95 33,95" fill="#2ecc71" stroke="#27ae60" stroke-width="2"/>
  
  <!-- 线条 -->
  <line x1="70" y1="70" x2="90" y2="90" stroke="#f39c12" stroke-width="3" stroke-linecap="round"/>
  
  <!-- 工具图标 -->
  <g transform="translate(95, 10)">
    <circle cx="8" cy="8" r="6" fill="white" opacity="0.8"/>
    <path d="M5 5 L11 11 M11 5 L5 11" stroke="#666" stroke-width="1.5" stroke-linecap="round"/>
  </g>
</svg>`;

// 创建简化版本的PNG数据（Base64编码的1x1像素PNG）
function createSimplePNG(size, color = '#667eea') {
    // 这是一个简化的方法，创建纯色PNG
    // 实际项目中应该使用专门的图像处理库
    const canvas = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="${Math.floor(size/5)}" fill="${color}"/>
        <rect x="${Math.floor(size*0.15)}" y="${Math.floor(size*0.15)}" width="${Math.floor(size*0.7)}" height="${Math.floor(size*0.7)}" rx="${Math.floor(size/16)}" fill="white" opacity="0.9"/>
        <circle cx="${Math.floor(size*0.35)}" cy="${Math.floor(size*0.35)}" r="${Math.floor(size*0.09)}" fill="#3498db"/>
        <rect x="${Math.floor(size*0.5)}" y="${Math.floor(size*0.26)}" width="${Math.floor(size*0.19)}" height="${Math.floor(size*0.125)}" fill="#e74c3c"/>
        <polygon points="${Math.floor(size*0.35)},${Math.floor(size*0.59)} ${Math.floor(size*0.45)},${Math.floor(size*0.74)} ${Math.floor(size*0.26)},${Math.floor(size*0.74)}" fill="#2ecc71"/>
    </svg>`;
    
    return canvas;
}

// 创建icons目录
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

// 生成不同尺寸的SVG文件
const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
    const svgData = createSimplePNG(size);
    const filename = `icon${size}.svg`;
    fs.writeFileSync(path.join(iconsDir, filename), svgData);
    console.log(`Generated ${filename}`);
});

console.log('SVG icons generated successfully!');
console.log('Please use the generate-icons.html page to convert them to PNG format.');