// 颜色选择器功能
class ColorPicker {
    constructor(canvasId, currentColorId, hexDisplayId) {
        this.canvas = document.getElementById(canvasId);
        // 频繁使用 getImageData，启用 willReadFrequently 以优化性能并消除警告
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.currentColorDisplay = document.getElementById(currentColorId);
        this.hexDisplay = document.getElementById(hexDisplayId);
        
        this.canvas.width = 200;
        this.canvas.height = 150;
        
        this.init();
        this.setupEventListeners();
    }
    
    init() {
        this.drawColorPicker();
        this.updateCurrentColor('#000000');
    }
    
    drawColorPicker() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // 创建渐变
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const hue = (x / width) * 360;
                const saturation = 100;
                const lightness = ((height - y) / height) * 100;
                
                const color = this.hslToRgb(hue, saturation, lightness);
                this.ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
                this.ctx.fillRect(x, y, 1, 1);
            }
        }
    }
    
    hslToRgb(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;
        
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
    
    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);
            
            const imageData = this.ctx.getImageData(x, y, 1, 1);
            const [r, g, b] = imageData.data;
            
            const hexColor = this.rgbToHex(r, g, b);
            this.updateCurrentColor(hexColor);
            
            // 触发颜色变化事件
            if (window.canvasEngine) {
                window.canvasEngine.setCurrentColor(hexColor);
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);
            
            if (x >= 0 && x < this.canvas.width && y >= 0 && y < this.canvas.height) {
                const imageData = this.ctx.getImageData(x, y, 1, 1);
                const [r, g, b] = imageData.data;
                const hexColor = this.rgbToHex(r, g, b);
                
                // 显示预览颜色（可选）
                this.canvas.title = hexColor;
            }
        });
    }
    
    updateCurrentColor(color) {
        this.currentColorDisplay.style.backgroundColor = color;
        this.hexDisplay.textContent = color.toUpperCase();
    }
    
    setColor(color) {
        this.updateCurrentColor(color);
        if (window.canvasEngine) {
            window.canvasEngine.setCurrentColor(color);
        }
    }
}

// 初始化颜色选择器
document.addEventListener('DOMContentLoaded', function() {
    const colorPicker = new ColorPicker('color-picker-canvas', 'current-color-preview', 'current-color-hex');
    
    // HTML颜色输入框事件
    // 与 popup.html 中的输入框 id 对齐（为 'color-input'）
    const htmlColorInput = document.getElementById('color-input');
    if (htmlColorInput) {
        htmlColorInput.addEventListener('change', function() {
            colorPicker.setColor(this.value);
        });
    }
    
    // 预设颜色点击事件
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', function() {
            const color = window.getComputedStyle(this).backgroundColor;
            const rgb = color.match(/\d+/g);
            if (rgb) {
                const hexColor = colorPicker.rgbToHex(parseInt(rgb[0]), parseInt(rgb[1]), parseInt(rgb[2]));
                colorPicker.setColor(hexColor);
                if (htmlColorInput) {
                    htmlColorInput.value = hexColor;
                }
            }
        });
    });
    
    // 将颜色选择器实例暴露给全局
    window.colorPicker = colorPicker;
});