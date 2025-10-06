// 全局变量
let canvasEngine;

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    const canvas = document.getElementById('canvas');
    canvasEngine = new CanvasEngine(canvas);
    
    setupToolButtons();
    setupColorControls();
    setupExportButtons();
    setupKeyboardShortcuts();
    setupShortcutsModal();
}

function setupToolButtons() {
    // 形状工具按钮
    const shapeButtons = document.querySelectorAll('[data-shape]');
    shapeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const shape = this.getAttribute('data-shape');
            setActiveTool(shape);
            canvasEngine.setTool(shape);
        });
    });
    
    // 选择工具
    const selectTool = document.getElementById('select-tool');
    selectTool.addEventListener('click', function() {
        setActiveTool('select');
        canvasEngine.setTool('select');
    });

    // 标注工具
    const annotateTool = document.getElementById('annotate-tool');
    if (annotateTool) {
        annotateTool.addEventListener('click', function() {
            setActiveTool('annotate');
            canvasEngine.setTool('annotate');
        });
    }
    
    // 切割工具
    const cutTool = document.getElementById('cut-tool');
    if (cutTool) {
        cutTool.addEventListener('click', function() {
            setActiveTool('cut');
            canvasEngine.setTool('cut');
        });
    }
    
    // 删除工具
    const deleteTool = document.getElementById('delete-tool');
    deleteTool.addEventListener('click', function() {
        canvasEngine.deleteSelected();
    });
    
    // 撤销按钮
    const undoBtn = document.getElementById('undo-action');
    if (undoBtn) {
        undoBtn.addEventListener('click', function() {
            if (canvasEngine && typeof canvasEngine.undo === 'function') {
                canvasEngine.undo();
                showNotification(i18n('notif_undo_success'), 'success');
            }
        });
    }
    
    // 清空画布
    const clearAll = document.getElementById('clear-all');
    clearAll.addEventListener('click', function() {
        if (confirm(i18n('confirm_clear_all'))) {
            canvasEngine.clearAll();
        }
    });

    // 缩放控制
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => canvasEngine.zoomIn());
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => canvasEngine.zoomOut());
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => canvasEngine.resetZoom());
    
    // 默认选中选择工具
    setActiveTool('select');
}

function setActiveTool(toolName) {
    // 移除所有按钮的激活状态
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 激活当前工具按钮
    if (toolName === 'select') {
        document.getElementById('select-tool').classList.add('active');
    } else if (toolName === 'annotate') {
        const annotateBtn = document.getElementById('annotate-tool');
        if (annotateBtn) annotateBtn.classList.add('active');
    } else if (toolName === 'cut') {
        const cutBtn = document.getElementById('cut-tool');
        if (cutBtn) cutBtn.classList.add('active');
    } else {
        const activeButton = document.querySelector(`[data-shape="${toolName}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
    
    // 更新鼠标样式
    const canvas = document.getElementById('canvas');
    if (toolName === 'select') {
        canvas.style.cursor = 'default';
    } else {
        canvas.style.cursor = 'crosshair';
    }
}

function setupColorControls() {
    // 填充色控制
    const fillColorInput = document.getElementById('fill-color');
    fillColorInput.addEventListener('change', function() {
        canvasEngine.setStyle({ fillColor: this.value });
    });
    
    // 边框色控制
    const strokeColorInput = document.getElementById('stroke-color');
    strokeColorInput.addEventListener('change', function() {
        canvasEngine.setStyle({ strokeColor: this.value });
    });
    
    // 边框宽度控制
    const strokeWidthInput = document.getElementById('stroke-width');
    const strokeWidthValue = document.getElementById('stroke-width-value');
    
    strokeWidthInput.addEventListener('input', function() {
        const width = parseInt(this.value);
        strokeWidthValue.textContent = width;
        canvasEngine.setStyle({ strokeWidth: width });
    });
    
    // 预设颜色
    const colorSwatches = document.querySelectorAll('.color-swatch');
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', function() {
            const color = this.getAttribute('data-color');
            
            // 更新填充色
            fillColorInput.value = color;
            canvasEngine.setStyle({ fillColor: color });
            
            // 更新激活状态
            colorSwatches.forEach(s => s.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // 默认激活第二个颜色（蓝色）
    colorSwatches[1].classList.add('active');
}

function setupExportButtons() {
    // SVG导出
    const exportSvgBtn = document.getElementById('export-svg');
    exportSvgBtn.addEventListener('click', function() {
        exportSVG();
    });
    
    // PNG导出
    const exportPngBtn = document.getElementById('export-png');
    exportPngBtn.addEventListener('click', function() {
        exportPNG();
    });
}

function exportSVG() {
    try {
        const svgContent = canvasEngine.exportToSVG();
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `icon-${Date.now()}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        showNotification(i18n('notif_export_svg_success'), 'success');
    } catch (error) {
        console.error('SVG导出失败:', error);
        showNotification(i18n('notif_export_svg_error'), 'error');
    }
}

function exportPNG() {
    try {
        const originalCanvas = document.getElementById('canvas');
        // 创建临时canvas用于导出（与当前画布尺寸一致）
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = originalCanvas.width;
        tempCanvas.height = originalCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // 使用引擎的渲染到上下文方法，带变换但不绘制网格
        canvasEngine.renderToContext(tempCtx, { applyTransform: true, backgroundColor: '#ffffff' });
        
        // 导出临时canvas
        const link = document.createElement('a');
        link.href = tempCanvas.toDataURL('image/png');
        link.download = `icon-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification(i18n('notif_export_png_success'), 'success');
    } catch (error) {
        console.error('PNG导出失败:', error);
        showNotification(i18n('notif_export_png_error'), 'error');
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // 防止在输入框中触发快捷键
        if (e.target.tagName === 'INPUT') return;
        
        switch(e.key.toLowerCase()) {
            case 'v':
            case 'escape':
                setActiveTool('select');
                canvasEngine.setTool('select');
                break;
                
            case 'r':
                setActiveTool('rectangle');
                canvasEngine.setTool('rectangle');
                break;
                
            case 'c':
                setActiveTool('circle');
                canvasEngine.setTool('circle');
                break;
                
            case 't':
                setActiveTool('triangle');
                canvasEngine.setTool('triangle');
                break;
                
            case 'l':
                setActiveTool('line');
                canvasEngine.setTool('line');
                break;

            case 'x':
                // 切割工具快捷键
                setActiveTool('cut');
                canvasEngine.setTool('cut');
                break;
                
            case 'delete':
            case 'backspace':
                canvasEngine.deleteSelected();
                e.preventDefault();
                break;
                
            case 'a':
                if (e.ctrlKey) {
                    // Ctrl+A 全选（暂时不实现）
                    e.preventDefault();
                }
                break;
                
            case 's':
                if (e.ctrlKey) {
                    // Ctrl+S 保存为SVG
                    e.preventDefault();
                    exportSVG();
                }
                break;

            case 'z':
                if (e.ctrlKey) {
                    // Ctrl+Z 撤销上一步
                    e.preventDefault();
                    if (canvasEngine && typeof canvasEngine.undo === 'function') {
                        canvasEngine.undo();
                        showNotification('已撤销上一步', 'success');
                    }
                }
                break;
        }
    });
}

function setupShortcutsModal() {
    const helpBtn = document.getElementById('shortcuts-help');
    const overlay = document.getElementById('shortcuts-overlay');
    const modal = document.getElementById('shortcuts-modal');
    const closeBtn = document.getElementById('shortcuts-close');
    const appRoot = document.getElementById('app-root');

    if (!helpBtn || !overlay || !modal || !closeBtn || !appRoot) return;

    let previousFocus = null;

    const openModal = () => {
        previousFocus = document.activeElement;
        overlay.classList.add('modal-open');
        modal.classList.add('modal-open');
        overlay.setAttribute('aria-hidden', 'false');
        modal.setAttribute('aria-hidden', 'false');
        // 禁用背景交互与焦点
        appRoot.setAttribute('inert', '');
        // 将焦点移入弹窗，便于无障碍与避免 aria-hidden 焦点冲突
        closeBtn.focus();
    };
    const closeModal = () => {
        // 先恢复焦点到之前的元素，避免隐藏的区域包含焦点
        if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        } else {
            helpBtn.focus();
        }
        // 移除背景 inert
        appRoot.removeAttribute('inert');
        overlay.classList.remove('modal-open');
        modal.classList.remove('modal-open');
        overlay.setAttribute('aria-hidden', 'true');
        modal.setAttribute('aria-hidden', 'true');
    };

    helpBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    
    document.addEventListener('keydown', function(e) {
        // 在弹窗打开时，按 Esc 关闭
        const isOpen = modal.classList.contains('modal-open');
        if (isOpen && e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        }
    });
}

function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    
    // 设置颜色
    switch(type) {
        case 'success':
            notification.style.backgroundColor = '#28a745';
            break;
        case 'error':
            notification.style.backgroundColor = '#dc3545';
            break;
        case 'warning':
            notification.style.backgroundColor = '#ffc107';
            notification.style.color = '#212529';
            break;
        default:
            notification.style.backgroundColor = '#007bff';
    }
    
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 自动隐藏
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

// 工具提示功能
function setupTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    
    tooltipElements.forEach(element => {
        element.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = this.getAttribute('data-tooltip');
            tooltip.style.cssText = `
                position: absolute;
                background: #333;
                color: white;
                padding: 6px 10px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1000;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease;
            `;
            
            document.body.appendChild(tooltip);
            
            const rect = this.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = rect.bottom + 8 + 'px';
            
            setTimeout(() => tooltip.style.opacity = '1', 100);
            
            this._tooltip = tooltip;
        });
        
        element.addEventListener('mouseleave', function() {
            if (this._tooltip) {
                this._tooltip.style.opacity = '0';
                setTimeout(() => {
                    if (this._tooltip && this._tooltip.parentNode) {
                        this._tooltip.parentNode.removeChild(this._tooltip);
                    }
                    this._tooltip = null;
                }, 200);
            }
        });
    });
}

// 响应式处理 - 简化为插件窗口
function handleResize() {
    const canvas = document.getElementById('canvas');
    
    // 固定更大的画布尺寸以提升设计体验
    canvas.width = 800;
    canvas.height = 600;
    
    if (canvasEngine) {
        canvasEngine.render();
    }
}

window.addEventListener('resize', handleResize);

// 初始化工具提示
document.addEventListener('DOMContentLoaded', function() {
    setupTooltips();
    handleResize();
});