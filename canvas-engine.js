class CanvasEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // 使用页面提供的画布尺寸，不再强制缩小
        this.shapes = [];
        this.selectedShape = null;
        this.currentTool = 'select';
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        // 视图缩放与平移
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        // 切割拖拽状态
        this.isCutting = false;
        this.cutStart = { x: 0, y: 0 };
        // 端点高亮与吸附阈值
        this.highlightStart = null;
        this.highlightEnd = null;
        this.snapPixelThreshold = 8;
        // 两点裁剪状态：是否已选择起点，等待第二个点
        this.awaitingSecondCutPoint = false;
        // 历史栈（用于撤销）
        this.history = [];
        // 悬停的标注（用于非标注模式下仅显示靠近的标注点）
        this.hoverAnnotation = null;
        // 画布全局标注（不隶属于某个图形）
        this.globalAnnotations = [];
        // 悬停的全局标注索引
        this.hoverGlobalAnnotation = null;
        // 标注样式（点尺寸、颜色与编号样式可自定义）
        this.annotationStyle = {
            dotRadius: 4,
            dotFill: '#ffffff',
            dotStroke: '#ff4757',
            dotStrokeWidth: 1,
            labelFont: '10px sans-serif',
            labelColor: '#ff4757',
            labelOffsetX: 6,
            labelAlign: 'left',
            labelBaseline: 'middle'
        };
        // 悬停的图形（用于非标注模式下靠近图形时显示其所有标注）
        this.hoverShapeId = null;
        
        // 默认样式
        this.currentStyle = {
            fillColor: '#3498db',
            strokeColor: '#2c3e50',
            strokeWidth: 2,
            // 新增：填充类型与选项，用于多色/渐变/图案等效果
            // fillType: 'solid' | 'linearGradient' | 'radialGradient' | 'patternStripes' | 'patternDots'
            fillType: 'solid',
            fillOptions: {
                // 线性渐变：colors、stops(0-1)、angle(度)
                colors: ['#3498db', '#8e44ad'],
                stops: [0, 1],
                angle: 0,
                // 径向渐变：colors、stops(0-1)、innerRatio(0-1)
                innerRatio: 0,
                // 条纹图案：colors[bg, stripe]、stripeWidth、angle
                stripeWidth: 8,
                // 圆点图案：bgColor、dotColor、dotRadius、spacing
                bgColor: '#ffffff',
                dotColor: '#3498db',
                dotRadius: 3,
                spacing: 12
            }
        };
        
        // 加载保存的数据
        this.loadFromStorage();
        
        this.setupEventListeners();
        this.render();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this));
        // 鼠标滑轮缩放
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    // 屏幕坐标转换为世界坐标（考虑缩放/平移）
    toWorld(screenX, screenY) {
        return { x: (screenX - this.panX) / this.zoom, y: (screenY - this.panY) / this.zoom };
    }

    // 获取鼠标的世界坐标
    getMouseWorld(e) {
        const rect = this.canvas.getBoundingClientRect();
        // 考虑 CSS 缩放与高 DPI，将屏幕坐标转换为画布内部坐标
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const sx = (e.clientX - rect.left) * scaleX;
        const sy = (e.clientY - rect.top) * scaleY;
        return this.toWorld(sx, sy);
    }
    
    handleMouseDown(e) {
        const { x, y } = this.getMouseWorld(e);
        
        this.startX = x;
        this.startY = y;
        
        if (this.currentTool === 'select') {
            const clickedShape = this.getShapeAtPoint(x, y);
            if (clickedShape) {
                this.selectedShape = clickedShape;
                this.isDragging = true;
                // 根据形状类型计算正确的拖拽偏移
                this.dragOffset = this.calculateDragOffset(x, y, clickedShape);
            } else {
                this.selectedShape = null;
            }
        } else if (this.isShapeTool(this.currentTool)) {
            this.isDrawing = true;
        } else if (this.currentTool === 'annotate') {
            const targetShape = this.getShapeAtPoint(x, y);
            if (targetShape) {
                this.pushHistory();
                if (!targetShape.annotations) targetShape.annotations = [];
                const label = String((targetShape.annotations.length || 0) + 1);
                targetShape.annotations.push({ x, y, label });
                this.saveToStorage();
            } else {
                // 空白画布上的标注
                this.pushHistory();
                const label = String((this.globalAnnotations.length || 0) + 1);
                this.globalAnnotations.push({ x, y, label });
                this.saveToStorage();
            }
            // 标注点按即生效
            this.render();
        } else if (this.currentTool === 'cut') {
            // 两点裁剪：第一次点击设置起点；第二次点击设置终点
            this.isCutting = true;
            const near = this.findNearestEndpoint(x, y, this.snapPixelThreshold / this.zoom);
            if (!this.awaitingSecondCutPoint) {
                // 选择起点
                if (near) {
                    this.cutStart = { x: near.x, y: near.y };
                    this.highlightStart = { x: near.x, y: near.y };
                } else {
                    this.cutStart = { x, y };
                    this.highlightStart = null;
                }
            } else {
                // 已有起点，预览由起点到当前鼠标位置的线
                this.highlightEnd = near ? { x: near.x, y: near.y } : null;
            }
        }
        
        this.render();
    }
    
    handleMouseMove(e) {
        const { x, y } = this.getMouseWorld(e);
        
        if (this.isDragging && this.selectedShape) {
            // 根据形状类型更新位置
            this.updateShapePosition(x, y, this.selectedShape);
            // 拖拽过程中也进行标注悬停检测
            const changed = this.updateHoverAnnotation(x, y);
            this.render();
        } else if (this.isDrawing && this.isShapeTool(this.currentTool)) {
            // 新图形绘制预览过程中也进行标注悬停检测，便于靠近时显示标注
            this.updateHoverAnnotation(x, y);
            this.renderPreview(x, y);
        } else if ((this.isCutting || this.awaitingSecondCutPoint) && this.currentTool === 'cut') {
            const near = this.findNearestEndpoint(x, y, this.snapPixelThreshold / this.zoom);
            if (near) {
                this.highlightEnd = { x: near.x, y: near.y };
                this.renderCutPreview(this.cutStart.x, this.cutStart.y, near.x, near.y);
            } else {
                this.highlightEnd = null;
                this.renderCutPreview(this.cutStart.x, this.cutStart.y, x, y);
            }
        } else {
            // 非拖拽/绘制/裁剪时进行标注悬停检测
            const changed = this.updateHoverAnnotation(x, y);
            if (changed) this.render();
        }
    }

    // 计算拖拽偏移
    calculateDragOffset(mouseX, mouseY, shape) {
        switch (shape.type) {
            case 'rectangle':
                return {
                    x: mouseX - shape.x,
                    y: mouseY - shape.y
                };
            case 'circle':
                return {
                    x: mouseX - shape.x,
                    y: mouseY - shape.y
                };
            case 'ellipse':
                return {
                    x: mouseX - shape.x,
                    y: mouseY - shape.y
                };
            case 'triangle':
            case 'star':
            case 'arrow':
            case 'pentagon':
            case 'hexagon':
            case 'diamond':
            case 'polygon':
                // 使用形状的边界框中心作为参考点
                const bounds = this.getShapeBounds(shape);
                const centerX = bounds.x + bounds.width / 2;
                const centerY = bounds.y + bounds.height / 2;
                return {
                    x: mouseX - centerX,
                    y: mouseY - centerY,
                    originalCenter: { x: centerX, y: centerY }
                };
            case 'line':
                return {
                    x: mouseX - shape.x1,
                    y: mouseY - shape.y1,
                    x2Offset: shape.x2 - shape.x1,
                    y2Offset: shape.y2 - shape.y1
                };
            default:
                return { x: 0, y: 0 };
        }
    }

    // 更新形状位置
    updateShapePosition(mouseX, mouseY, shape) {
        switch (shape.type) {
            case 'rectangle':
                {
                    const newX = mouseX - this.dragOffset.x;
                    const newY = mouseY - this.dragOffset.y;
                    const deltaX = newX - shape.x;
                    const deltaY = newY - shape.y;
                    shape.x = newX;
                    shape.y = newY;
                    if (shape.annotations && shape.annotations.length) {
                        shape.annotations = shape.annotations.map(a => ({ x: a.x + deltaX, y: a.y + deltaY, label: a.label }));
                    }
                }
                break;
            case 'circle':
                {
                    const newX = mouseX - this.dragOffset.x;
                    const newY = mouseY - this.dragOffset.y;
                    const deltaX = newX - shape.x;
                    const deltaY = newY - shape.y;
                    shape.x = newX;
                    shape.y = newY;
                    if (shape.annotations && shape.annotations.length) {
                        shape.annotations = shape.annotations.map(a => ({ x: a.x + deltaX, y: a.y + deltaY, label: a.label }));
                    }
                }
                break;
            case 'ellipse':
                {
                    const newX = mouseX - this.dragOffset.x;
                    const newY = mouseY - this.dragOffset.y;
                    const deltaX = newX - shape.x;
                    const deltaY = newY - shape.y;
                    shape.x = newX;
                    shape.y = newY;
                    if (shape.annotations && shape.annotations.length) {
                        shape.annotations = shape.annotations.map(a => ({ x: a.x + deltaX, y: a.y + deltaY, label: a.label }));
                    }
                }
                break;
            case 'triangle':
            case 'star':
            case 'arrow':
            case 'pentagon':
            case 'hexagon':
            case 'diamond':
            case 'polygon':
                // 计算新的中心位置
                const newCenterX = mouseX - this.dragOffset.x;
                const newCenterY = mouseY - this.dragOffset.y;
                
                // 计算偏移量
                const deltaX = newCenterX - this.dragOffset.originalCenter.x;
                const deltaY = newCenterY - this.dragOffset.originalCenter.y;
                
                // 更新所有点的位置
                shape.points = shape.points.map(point => ({
                    x: point.x + deltaX,
                    y: point.y + deltaY
                }));
                
                // 更新原始中心位置
                this.dragOffset.originalCenter.x = newCenterX;
                this.dragOffset.originalCenter.y = newCenterY;

                // 同步移动标注
                if (shape.annotations && shape.annotations.length) {
                    shape.annotations = shape.annotations.map(a => ({ x: a.x + deltaX, y: a.y + deltaY, label: a.label }));
                }
                break;
            case 'line':
                {
                    const newX1 = mouseX - this.dragOffset.x;
                    const newY1 = mouseY - this.dragOffset.y;
                    const deltaX = newX1 - shape.x1;
                    const deltaY = newY1 - shape.y1;
                    shape.x1 = newX1;
                    shape.y1 = newY1;
                    shape.x2 = shape.x1 + this.dragOffset.x2Offset;
                    shape.y2 = shape.y1 + this.dragOffset.y2Offset;
                    if (shape.annotations && shape.annotations.length) {
                        shape.annotations = shape.annotations.map(a => ({ x: a.x + deltaX, y: a.y + deltaY, label: a.label }));
                    }
                }
                break;
        }
    }
    
    handleMouseUp(e) {
        const { x, y } = this.getMouseWorld(e);
        
        if (this.isDrawing && this.isShapeTool(this.currentTool)) {
            this.pushHistory();
            this.createShape(this.currentTool, this.startX, this.startY, x, y);
            this.isDrawing = false;
            // 保存数据到本地存储
            this.saveToStorage();
        }
        
        if (this.isDragging && this.selectedShape) {
            // 拖拽结束后保存数据
            this.pushHistory();
            this.saveToStorage();
        }
        
        if (this.currentTool === 'cut') {
            const endPt = this.highlightEnd ? this.highlightEnd : { x, y };
            const dx = endPt.x - this.cutStart.x;
            const dy = endPt.y - this.cutStart.y;
            const screenDist2 = (dx * this.zoom) * (dx * this.zoom) + (dy * this.zoom) * (dy * this.zoom);
            const clickThreshold2 = 9; // ~3px

            if (!this.awaitingSecondCutPoint) {
                // 第一次点击：如果未拖拽（距离很小），仅记录起点并等待第二个点
                if (screenDist2 < clickThreshold2) {
                    this.awaitingSecondCutPoint = true;
                    this.isCutting = false;
                    // 保留起点高亮，清除终点高亮
                    // 在移动时会继续预览从起点到当前鼠标位置的线
                } else {
                    // 拖拽方式：直接两点完成裁剪
                    this.pushHistory();
                    this.cutBySegment(this.cutStart.x, this.cutStart.y, endPt.x, endPt.y);
                    this.isCutting = false;
                    this.awaitingSecondCutPoint = false;
                    this.highlightStart = null;
                    this.highlightEnd = null;
                    this.saveToStorage();
                }
            } else {
                // 第二次点击：完成从起点到当前点的裁剪
                this.pushHistory();
                this.cutBySegment(this.cutStart.x, this.cutStart.y, endPt.x, endPt.y);
                this.isCutting = false;
                this.awaitingSecondCutPoint = false;
                this.highlightStart = null;
                this.highlightEnd = null;
                this.saveToStorage();
            }
        }
        
        this.isDragging = false;
        this.render();
    }
    
    handleClick(e) {
        const { x, y } = this.getMouseWorld(e);
        // 取消单击垂直裁剪；改为两点确认后裁剪
    }

    // 鼠标滑轮缩放，围绕鼠标位置进行
    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const sx = (e.clientX - rect.left) * scaleX;
        const sy = (e.clientY - rect.top) * scaleY;
        // 计算该屏幕点的世界坐标（缩放前）
        const world = this.toWorld(sx, sy);
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newZoom = Math.max(0.2, Math.min(5, this.zoom * factor));
        this.zoom = newZoom;
        // 调整平移，使该世界点在屏幕位置保持不变
        this.panX = sx - world.x * this.zoom;
        this.panY = sy - world.y * this.zoom;
        this.render();
    }
    
    isShapeTool(tool) {
        return ['rectangle', 'circle', 'triangle', 'line', 'ellipse', 'star', 'arrow', 'pentagon', 'hexagon', 'diamond'].includes(tool);
    }
    
    createShape(type, startX, startY, endX, endY) {
        const shape = {
            id: Date.now() + Math.random(),
            type: type,
            x: Math.min(startX, endX),
            y: Math.min(startY, endY),
            width: Math.abs(endX - startX),
            height: Math.abs(endY - startY),
            fillColor: this.currentStyle.fillColor,
            strokeColor: this.currentStyle.strokeColor,
            strokeWidth: this.currentStyle.strokeWidth,
            // 携带填充类型与选项到形状
            fillType: this.currentStyle.fillType,
            fillOptions: JSON.parse(JSON.stringify(this.currentStyle.fillOptions))
        };
        
        // 特殊处理不同形状
        if (type === 'circle') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const radius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            shape.x = centerX;
            shape.y = centerY;
            shape.radius = radius;
        } else if (type === 'ellipse') {
            shape.radiusX = Math.abs(endX - startX) / 2;
            shape.radiusY = Math.abs(endY - startY) / 2;
            shape.x = startX + (endX - startX) / 2;
            shape.y = startY + (endY - startY) / 2;
        } else if (type === 'line') {
            shape.x1 = startX;
            shape.y1 = startY;
            shape.x2 = endX;
            shape.y2 = endY;
        } else if (type === 'triangle') {
            shape.points = [
                { x: startX + (endX - startX) / 2, y: startY },
                { x: endX, y: endY },
                { x: startX, y: endY }
            ];
        } else if (type === 'star') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const outerRadius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            const innerRadius = outerRadius * 0.4;
            shape.points = this.createStarPoints(centerX, centerY, 5, outerRadius, innerRadius);
        } else if (type === 'arrow') {
            const arrowWidth = Math.abs(endX - startX);
            const arrowHeight = Math.abs(endY - startY);
            shape.points = [
                { x: startX, y: startY + arrowHeight * 0.3 },
                { x: startX + arrowWidth * 0.7, y: startY + arrowHeight * 0.3 },
                { x: startX + arrowWidth * 0.7, y: startY },
                { x: endX, y: startY + arrowHeight / 2 },
                { x: startX + arrowWidth * 0.7, y: endY },
                { x: startX + arrowWidth * 0.7, y: startY + arrowHeight * 0.7 },
                { x: startX, y: startY + arrowHeight * 0.7 }
            ];
        } else if (type === 'pentagon') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const radius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            shape.points = this.createPolygonPoints(centerX, centerY, 5, radius);
        } else if (type === 'hexagon') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const radius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            shape.points = this.createPolygonPoints(centerX, centerY, 6, radius);
        } else if (type === 'diamond') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const halfWidth = Math.abs(endX - startX) / 2;
            const halfHeight = Math.abs(endY - startY) / 2;
            shape.points = [
                { x: centerX, y: startY },
                { x: endX, y: centerY },
                { x: centerX, y: endY },
                { x: startX, y: centerY }
            ];
        }
        
        this.shapes.push(shape);
        this.selectedShape = shape;
    }
    
    getShapeAtPoint(x, y) {
        // 从后往前查找，优先选择最上层的图形
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            if (this.isPointInShape(x, y, shape)) {
                return shape;
            }
        }
        return null;
    }
    
    isPointInShape(x, y, shape) {
        switch (shape.type) {
            case 'rectangle':
                {
                    const m = 6 / this.zoom; // 允许边缘附近点击
                    return x >= shape.x - m && x <= shape.x + shape.width + m &&
                           y >= shape.y - m && y <= shape.y + shape.height + m;
                }
            
            case 'circle':
                {
                    const dx = x - shape.x;
                    const dy = y - shape.y;
                    const m = 6 / this.zoom;
                    return Math.sqrt(dx * dx + dy * dy) <= shape.radius + m;
                }
            
            case 'ellipse':
                // 椭圆内部点检测
                {
                    const ellipseDx = x - shape.x;
                    const ellipseDy = y - shape.y;
                    const m = 6 / this.zoom;
                    const eps = m / Math.max(1, Math.min(shape.radiusX, shape.radiusY));
                    return (ellipseDx * ellipseDx) / (shape.radiusX * shape.radiusX) + 
                           (ellipseDy * ellipseDy) / (shape.radiusY * shape.radiusY) <= 1 + eps;
                }
            
            case 'triangle':
                {
                    const inside = this.isPointInTriangle(x, y, shape.points);
                    if (inside) return true;
                    const m = 6 / this.zoom;
                    return this.isPointNearPolygonEdge(x, y, shape.points, m);
                }
            
            case 'star':
            case 'arrow':
            case 'pentagon':
            case 'hexagon':
            case 'diamond':
            case 'polygon':
                // 对于多边形，使用射线法检测点是否在内部
                {
                    const inside = this.isPointInPolygon(x, y, shape.points);
                    if (inside) return true;
                    const m = 6 / this.zoom;
                    return this.isPointNearPolygonEdge(x, y, shape.points, m);
                }
            
            case 'line':
                // 命中阈值按缩放缩放到世界单位，保证不同缩放下选择手感一致
                const lineThreshold = Math.max(8 / this.zoom, (shape.strokeWidth || 1) / this.zoom);
                return this.isPointNearLine(x, y, shape.x1, shape.y1, shape.x2, shape.y2, lineThreshold);
            
            default:
                return false;
        }
    }
    
    isPointInTriangle(x, y, points) {
        const [p1, p2, p3] = points;
        const area = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y));
        const area1 = Math.abs((p1.x - x) * (p2.y - y) - (p2.x - x) * (p1.y - y));
        const area2 = Math.abs((p2.x - x) * (p3.y - y) - (p3.x - x) * (p2.y - y));
        const area3 = Math.abs((p3.x - x) * (p1.y - y) - (p1.x - x) * (p3.y - y));
        return Math.abs(area - (area1 + area2 + area3)) < 1;
    }

    // 使用射线法检测点是否在多边形内部
    isPointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // 检测点是否靠近多边形任意边
    isPointNearPolygonEdge(x, y, points, threshold = 5) {
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            if (this.isPointNearLine(x, y, p1.x, p1.y, p2.x, p2.y, threshold)) {
                return true;
            }
        }
        return false;
    }

    // 更新悬停标注/图形/全局标注状态，返回是否发生变化
    updateHoverAnnotation(x, y) {
        const dotThreshold = 14 / this.zoom; // 提高灵敏度（约 14px 屏幕距离）
        const prevHoverAnn = this.hoverAnnotation;
        const prevHoverShape = this.hoverShapeId;
        const prevHoverGlobal = this.hoverGlobalAnnotation;
        let foundAnn = null;
        let foundShape = null;
        let foundGlobal = null;

        // 先检测全局标注
        if (this.globalAnnotations && this.globalAnnotations.length) {
            for (let j = 0; j < this.globalAnnotations.length; j++) {
                const a = this.globalAnnotations[j];
                const dx = x - a.x;
                const dy = y - a.y;
                if (Math.sqrt(dx * dx + dy * dy) <= dotThreshold) {
                    foundGlobal = j;
                    break;
                }
            }
        }

        // 从上层到下层查找，优先命中更靠上的图形或标注
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            if (!shape.annotations || !shape.annotations.length) {
                // 没有标注也允许形状悬停以便将来标注，但这里只在存在标注时展示
                continue;
            }

            // 1) 先检测靠近具体标注点（优先级更高）
            for (let j = 0; j < shape.annotations.length; j++) {
                const a = shape.annotations[j];
                const dx = x - a.x;
                const dy = y - a.y;
                if (Math.sqrt(dx * dx + dy * dy) <= dotThreshold) {
                    foundAnn = { shapeId: shape.id, index: j };
                    foundShape = shape.id;
                    break;
                }
            }
            if (foundAnn) break;

            // 2) 再检测靠近图形（在图形内或边缘附近）以显示该图形的全部标注
            const t = 12 / this.zoom; // 图形边缘容忍度，提高靠近显示的灵敏度
            let nearShape = false;
            switch (shape.type) {
                case 'rectangle':
                    nearShape = x >= shape.x - t && x <= shape.x + shape.width + t &&
                                y >= shape.y - t && y <= shape.y + shape.height + t;
                    break;
                case 'circle': {
                    const dx = x - shape.x;
                    const dy = y - shape.y;
                    nearShape = Math.sqrt(dx * dx + dy * dy) <= shape.radius + t;
                    break;
                }
                case 'ellipse': {
                    const dx = x - shape.x;
                    const dy = y - shape.y;
                    const eps = t / Math.max(1, Math.min(shape.radiusX, shape.radiusY));
                    nearShape = (dx * dx) / (shape.radiusX * shape.radiusX) + (dy * dy) / (shape.radiusY * shape.radiusY) <= 1 + eps;
                    break;
                }
                case 'triangle':
                    nearShape = this.isPointInTriangle(x, y, shape.points) || this.isPointNearPolygonEdge(x, y, shape.points, t);
                    break;
                case 'star':
                case 'arrow':
                case 'pentagon':
                case 'hexagon':
                case 'diamond':
                case 'polygon':
                    nearShape = this.isPointInPolygon(x, y, shape.points) || this.isPointNearPolygonEdge(x, y, shape.points, t);
                    break;
                case 'line': {
                    const lineT = Math.max(12 / this.zoom, (shape.strokeWidth || 1) / this.zoom);
                    nearShape = this.isPointNearLine(x, y, shape.x1, shape.y1, shape.x2, shape.y2, lineT);
                    break;
                }
                default:
                    nearShape = false;
            }

            if (nearShape) {
                foundShape = shape.id;
                break;
            }
        }

        this.hoverAnnotation = foundAnn;
        this.hoverShapeId = foundShape;
        this.hoverGlobalAnnotation = foundGlobal;
        const changed = (prevHoverAnn?.shapeId !== foundAnn?.shapeId || prevHoverAnn?.index !== foundAnn?.index || prevHoverShape !== foundShape || prevHoverGlobal !== foundGlobal);
        return changed;
    }
    
    isPointNearLine(x, y, x1, y1, x2, y2, threshold = 5) {
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy) <= threshold;
    }
    
    renderPreview(currentX, currentY) {
        this.render();
        
        this.ctx.save();
        // 应用与主渲染一致的缩放和平移，保证预览位置与鼠标一致
        this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeStyle = '#007bff';
        this.ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
        
        // 根据当前工具类型创建预览形状
        const previewShape = this.createPreviewShape(this.currentTool, this.startX, this.startY, currentX, currentY);
        this.drawShape(previewShape);
        
        this.ctx.restore();
    }
    
    // 根据形状与样式类型生成填充样式（颜色/渐变/图案）
    getFillStyleForShape(ctx, shape) {
        const type = shape.fillType || 'solid';
        if (type === 'solid' || !shape.fillOptions) {
            return shape.fillColor;
        }
        const bounds = this.getShapeBounds(shape);
        switch (type) {
            case 'linearGradient':
                return this.createLinearGradientForBounds(ctx, bounds, shape.fillOptions);
            case 'radialGradient':
                return this.createRadialGradientForBounds(ctx, bounds, shape.fillOptions);
            case 'patternStripes':
                return this.createStripePattern(ctx, shape.fillOptions);
            case 'patternDots':
                return this.createDotPattern(ctx, shape.fillOptions);
            default:
                return shape.fillColor;
        }
    }

    // 线性渐变：按角度覆盖形状外接矩形
    createLinearGradientForBounds(ctx, bounds, options = {}) {
        const colors = options.colors && options.colors.length ? options.colors : [this.currentStyle.fillColor, '#ffffff'];
        const stops = options.stops && options.stops.length === colors.length ? options.stops : colors.map((_, i) => i / (colors.length - 1));
        const angleDeg = typeof options.angle === 'number' ? options.angle : 0;
        const angle = angleDeg * Math.PI / 180;
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const halfDiag = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height) / 2;
        const dx = Math.cos(angle) * halfDiag;
        const dy = Math.sin(angle) * halfDiag;
        const x0 = cx - dx; const y0 = cy - dy;
        const x1 = cx + dx; const y1 = cy + dy;
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        for (let i = 0; i < colors.length; i++) {
            grad.addColorStop(stops[i], colors[i]);
        }
        return grad;
    }

    // 径向渐变：以外接矩形中心与最大半径
    createRadialGradientForBounds(ctx, bounds, options = {}) {
        const colors = options.colors && options.colors.length ? options.colors : [this.currentStyle.fillColor, '#ffffff'];
        const stops = options.stops && options.stops.length === colors.length ? options.stops : colors.map((_, i) => i / (colors.length - 1));
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const outerR = Math.max(bounds.width, bounds.height) / 2;
        const innerRatio = typeof options.innerRatio === 'number' ? Math.max(0, Math.min(1, options.innerRatio)) : 0;
        const innerR = outerR * innerRatio;
        const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
        for (let i = 0; i < colors.length; i++) {
            grad.addColorStop(stops[i], colors[i]);
        }
        return grad;
    }

    // 条纹图案：可旋转（浏览器支持 CanvasPattern.setTransform）
    createStripePattern(ctx, options = {}) {
        const stripeWidth = options.stripeWidth || 8;
        const tileSize = stripeWidth * 2;
        const bg = options.colors && options.colors[0] ? options.colors[0] : '#ffffff';
        const stripe = options.colors && options.colors[1] ? options.colors[1] : this.currentStyle.fillColor;
        const angleDeg = typeof options.angle === 'number' ? options.angle : 0;
        const off = document.createElement('canvas');
        off.width = tileSize; off.height = tileSize;
        const octx = off.getContext('2d');
        // 背景
        octx.fillStyle = bg;
        octx.fillRect(0, 0, tileSize, tileSize);
        // 画竖条纹
        octx.fillStyle = stripe;
        octx.fillRect(0, 0, stripeWidth, tileSize);
        let pattern = ctx.createPattern(off, 'repeat');
        // 旋转图案（若支持）
        if (pattern && typeof pattern.setTransform === 'function') {
            const m = new DOMMatrix();
            pattern.setTransform(m.rotate(angleDeg));
        }
        return pattern || bg;
    }

    // 圆点图案
    createDotPattern(ctx, options = {}) {
        const spacing = options.spacing || 12;
        const tileSize = spacing;
        const bgColor = options.bgColor || '#ffffff';
        const dotColor = options.dotColor || this.currentStyle.fillColor;
        const dotRadius = options.dotRadius || 3;
        const off = document.createElement('canvas');
        off.width = tileSize; off.height = tileSize;
        const octx = off.getContext('2d');
        // 背景
        octx.fillStyle = bgColor;
        octx.fillRect(0, 0, tileSize, tileSize);
        // 中心点
        octx.fillStyle = dotColor;
        octx.beginPath();
        octx.arc(tileSize / 2, tileSize / 2, dotRadius, 0, Math.PI * 2);
        octx.fill();
        let pattern = ctx.createPattern(off, 'repeat');
        return pattern || bgColor;
    }

    // 切割线预览
    renderCutPreview(x1, y1, x2, y2) {
        this.render();
        this.ctx.save();
        // 使用当前变换在世界坐标绘制
        this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
        this.ctx.setLineDash([6, 4]);
        this.ctx.strokeStyle = '#e74c3c';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // 高亮端点
        const drawDot = (pt) => {
            if (!pt) return;
            this.ctx.beginPath();
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = '#e74c3c';
            this.ctx.lineWidth = 2;
            this.ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        };
        drawDot(this.highlightStart);
        drawDot(this.highlightEnd);
        this.ctx.restore();
    }

    // 查找最近的端点（矩形角、线段端点、多边形顶点）
    findNearestEndpoint(x, y, threshold = 5) {
        let nearest = null;
        let minDist2 = threshold * threshold;
        const consider = (pt) => {
            const dx = pt.x - x;
            const dy = pt.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= minDist2) {
                nearest = { x: pt.x, y: pt.y };
                minDist2 = d2;
            }
        };
        for (const shape of this.shapes) {
            switch (shape.type) {
                case 'rectangle': {
                    const pts = this.rectToPoints(shape);
                    pts.forEach(consider);
                    break;
                }
                case 'line': {
                    consider({ x: shape.x1, y: shape.y1 });
                    consider({ x: shape.x2, y: shape.y2 });
                    break;
                }
                case 'triangle':
                case 'star':
                case 'arrow':
                case 'pentagon':
                case 'hexagon':
                case 'diamond':
                case 'polygon': {
                    (shape.points || []).forEach(consider);
                    break;
                }
                default:
                    break;
            }
        }
        return nearest;
    }

    // 创建预览形状的方法
    createPreviewShape(type, startX, startY, endX, endY) {
        const shape = {
            type: type,
            x: Math.min(startX, endX),
            y: Math.min(startY, endY),
            width: Math.abs(endX - startX),
            height: Math.abs(endY - startY),
            fillColor: 'rgba(0, 123, 255, 0.1)',
            strokeColor: '#007bff',
            strokeWidth: 1
        };

        // 根据形状类型设置特殊属性
        if (type === 'circle') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const radius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            shape.x = centerX;
            shape.y = centerY;
            shape.radius = radius;
        } else if (type === 'ellipse') {
            shape.radiusX = Math.abs(endX - startX) / 2;
            shape.radiusY = Math.abs(endY - startY) / 2;
            shape.x = startX + (endX - startX) / 2;
            shape.y = startY + (endY - startY) / 2;
        } else if (type === 'line') {
            shape.x1 = startX;
            shape.y1 = startY;
            shape.x2 = endX;
            shape.y2 = endY;
        } else if (type === 'triangle') {
            shape.points = [
                { x: startX + (endX - startX) / 2, y: startY },
                { x: endX, y: endY },
                { x: startX, y: endY }
            ];
        } else if (type === 'star') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const outerRadius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            const innerRadius = outerRadius * 0.4;
            shape.points = this.createStarPoints(centerX, centerY, 5, outerRadius, innerRadius);
        } else if (type === 'arrow') {
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);
            const arrowHeadWidth = width * 0.3;
            const arrowBodyWidth = width * 0.15;
            
            shape.points = [
                { x: startX, y: startY + height / 2 - arrowBodyWidth },
                { x: startX + width - arrowHeadWidth, y: startY + height / 2 - arrowBodyWidth },
                { x: startX + width - arrowHeadWidth, y: startY },
                { x: endX, y: startY + height / 2 },
                { x: startX + width - arrowHeadWidth, y: endY },
                { x: startX + width - arrowHeadWidth, y: startY + height / 2 + arrowBodyWidth },
                { x: startX, y: startY + height / 2 + arrowBodyWidth }
            ];
        } else if (type === 'pentagon') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const radius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            shape.points = this.createPolygonPoints(centerX, centerY, 5, radius);
        } else if (type === 'hexagon') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const radius = Math.min(Math.abs(endX - startX), Math.abs(endY - startY)) / 2;
            shape.points = this.createPolygonPoints(centerX, centerY, 6, radius);
        } else if (type === 'diamond') {
            const centerX = startX + (endX - startX) / 2;
            const centerY = startY + (endY - startY) / 2;
            const halfWidth = Math.abs(endX - startX) / 2;
            const halfHeight = Math.abs(endY - startY) / 2;
            
            shape.points = [
                { x: centerX, y: startY },           // 上
                { x: endX, y: centerY },             // 右
                { x: centerX, y: endY },             // 下
                { x: startX, y: centerY }            // 左
            ];
        }

        return shape;
    }
    
    render() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 应用缩放与平移
        this.ctx.save();
        this.ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
        
        // 绘制网格
        this.drawGrid();
        
        // 绘制所有图形
        this.shapes.forEach(shape => {
            this.drawShape(shape);
        });
        
        // 绘制选中状态
        if (this.selectedShape) {
            this.drawSelection(this.selectedShape);
        }
        // 绘制全局标注
        this.drawGlobalAnnotations();
        this.ctx.restore();
    }

    // 将当前图形渲染到指定的 2D 上下文（用于导出）
    renderToContext(ctx, options = {}) {
        const { applyTransform = true, backgroundColor = '#ffffff' } = options;
        ctx.save();
        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (applyTransform) {
            ctx.setTransform(this.zoom, 0, 0, this.zoom, this.panX, this.panY);
        }
        this.shapes.forEach(shape => this.drawShapeToContext(ctx, shape));
        // 绘制全局标注到导出上下文
        if (this.globalAnnotations && this.globalAnnotations.length) {
            this.globalAnnotations.forEach((a, idx) => {
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#ff4757';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ff4757';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(a.label || String(idx + 1), a.x + 6, a.y);
                ctx.restore();
            });
        }
        ctx.restore();
    }
    
    drawGrid() {
        const gridSize = 20;
        this.ctx.save();
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.lineWidth = 0.5;
        
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    drawShape(shape) {
        this.ctx.save();
        this.ctx.fillStyle = this.getFillStyleForShape(this.ctx, shape);
        this.ctx.strokeStyle = shape.strokeColor;
        this.ctx.lineWidth = shape.strokeWidth;
        
        switch (shape.type) {
            case 'rectangle':
                this.ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
                if (shape.strokeWidth > 0) {
                    this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
                }
                break;
                
            case 'circle':
                this.ctx.beginPath();
                this.ctx.arc(shape.x, shape.y, shape.radius, 0, 2 * Math.PI);
                this.ctx.fill();
                if (shape.strokeWidth > 0) {
                    this.ctx.stroke();
                }
                break;

            case 'ellipse':
                this.ctx.beginPath();
                this.ctx.ellipse(shape.x, shape.y, shape.radiusX, shape.radiusY, 0, 0, 2 * Math.PI);
                this.ctx.fill();
                if (shape.strokeWidth > 0) {
                    this.ctx.stroke();
                }
                break;
                
            case 'triangle':
            case 'star':
            case 'arrow':
            case 'pentagon':
            case 'hexagon':
            case 'diamond':
            case 'polygon':
                if (shape.points && shape.points.length > 0) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(shape.points[0].x, shape.points[0].y);
                    for (let i = 1; i < shape.points.length; i++) {
                        this.ctx.lineTo(shape.points[i].x, shape.points[i].y);
                    }
                    this.ctx.closePath();
                    this.ctx.fill();
                    if (shape.strokeWidth > 0) {
                        this.ctx.stroke();
                    }
                }
                break;
                
            case 'line':
                this.ctx.beginPath();
                this.ctx.moveTo(shape.x1, shape.y1);
                this.ctx.lineTo(shape.x2, shape.y2);
                this.ctx.stroke();
                break;
        }
        // 绘制标注：标注模式显示全部；非标注模式仅显示悬停的标注
        this.drawAnnotations(shape);

        this.ctx.restore();
    }

    // 在指定的上下文上绘制形状（用于导出）
    drawShapeToContext(ctx, shape) {
        ctx.save();
        ctx.fillStyle = this.getFillStyleForShape(ctx, shape);
        ctx.strokeStyle = shape.strokeColor;
        ctx.lineWidth = shape.strokeWidth;
        switch (shape.type) {
            case 'rectangle':
                ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
                if (shape.strokeWidth > 0) ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
                break;
            case 'circle':
                ctx.beginPath();
                ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
                ctx.fill();
                if (shape.strokeWidth > 0) ctx.stroke();
                break;
            case 'ellipse':
                ctx.beginPath();
                ctx.ellipse(shape.x, shape.y, shape.radiusX, shape.radiusY, 0, 0, Math.PI * 2);
                ctx.fill();
                if (shape.strokeWidth > 0) ctx.stroke();
                break;
            case 'triangle':
            case 'star':
            case 'arrow':
            case 'pentagon':
            case 'hexagon':
            case 'diamond':
            case 'polygon':
                if (shape.points && shape.points.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(shape.points[0].x, shape.points[0].y);
                    for (let i = 1; i < shape.points.length; i++) {
                        ctx.lineTo(shape.points[i].x, shape.points[i].y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    if (shape.strokeWidth > 0) ctx.stroke();
                }
                break;
            case 'line':
                ctx.beginPath();
                ctx.moveTo(shape.x1, shape.y1);
                ctx.lineTo(shape.x2, shape.y2);
                ctx.stroke();
                break;
        }
        // 导出时也绘制标注
        if (shape.annotations && shape.annotations.length) {
            shape.annotations.forEach((a, idx) => {
                ctx.save();
                ctx.fillStyle = this.annotationStyle.dotFill;
                ctx.strokeStyle = this.annotationStyle.dotStroke;
                ctx.lineWidth = this.annotationStyle.dotStrokeWidth;
                ctx.beginPath();
                ctx.arc(a.x, a.y, this.annotationStyle.dotRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = this.annotationStyle.labelColor;
                ctx.font = this.annotationStyle.labelFont;
                ctx.textAlign = this.annotationStyle.labelAlign;
                ctx.textBaseline = this.annotationStyle.labelBaseline;
                ctx.fillText(a.label || String(idx + 1), a.x + this.annotationStyle.labelOffsetX, a.y);
                ctx.restore();
            });
        }
        ctx.restore();
    }

    // 绘制标注点和标签
    drawAnnotations(shape) {
        if (!shape.annotations || !shape.annotations.length) return;
        const drawOne = (a, idx) => {
            this.ctx.save();
            this.ctx.fillStyle = this.annotationStyle.dotFill;
            this.ctx.strokeStyle = this.annotationStyle.dotStroke;
            this.ctx.lineWidth = this.annotationStyle.dotStrokeWidth;
            this.ctx.beginPath();
            this.ctx.arc(a.x, a.y, this.annotationStyle.dotRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.fillStyle = this.annotationStyle.labelColor;
            this.ctx.font = this.annotationStyle.labelFont;
            this.ctx.textAlign = this.annotationStyle.labelAlign;
            this.ctx.textBaseline = this.annotationStyle.labelBaseline;
            this.ctx.fillText(a.label || String(idx + 1), a.x + this.annotationStyle.labelOffsetX, a.y);
            this.ctx.restore();
        };

        if (this.currentTool === 'annotate') {
            // 标注模式显示全部
            shape.annotations.forEach((a, idx) => drawOne(a, idx));
        } else if (this.hoverShapeId === shape.id) {
            // 非标注模式：靠近图形时显示该图形全部标注
            shape.annotations.forEach((a, idx) => drawOne(a, idx));
        } else if (this.hoverAnnotation && this.hoverAnnotation.shapeId === shape.id) {
            // 非标注模式：仅靠近具体标注点时显示该标注
            const idx = this.hoverAnnotation.index;
            const a = shape.annotations[idx];
            if (a) drawOne(a, idx);
        }
    }

    // 绘制全局（不属于任何图形）的标注
    drawGlobalAnnotations() {
        if (!this.globalAnnotations || !this.globalAnnotations.length) return;
        const drawOne = (a, idx) => {
            this.ctx.save();
            this.ctx.fillStyle = this.annotationStyle.dotFill;
            this.ctx.strokeStyle = this.annotationStyle.dotStroke;
            this.ctx.lineWidth = this.annotationStyle.dotStrokeWidth;
            this.ctx.beginPath();
            this.ctx.arc(a.x, a.y, this.annotationStyle.dotRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.fillStyle = this.annotationStyle.labelColor;
            this.ctx.font = this.annotationStyle.labelFont;
            this.ctx.textAlign = this.annotationStyle.labelAlign;
            this.ctx.textBaseline = this.annotationStyle.labelBaseline;
            this.ctx.fillText(a.label || String(idx + 1), a.x + this.annotationStyle.labelOffsetX, a.y);
            this.ctx.restore();
        };

        if (this.currentTool === 'annotate') {
            // 标注模式显示全部全局标注
            this.globalAnnotations.forEach((a, idx) => drawOne(a, idx));
        } else if (this.hoverShapeId == null) {
            // 非标注模式：鼠标在空白画布区域，显示全部全局标注
            this.globalAnnotations.forEach((a, idx) => drawOne(a, idx));
        } else if (this.hoverGlobalAnnotation != null) {
            // 非标注模式：靠近具体全局标注点时显示该点
            const idx = this.hoverGlobalAnnotation;
            const a = this.globalAnnotations[idx];
            if (a) drawOne(a, idx);
        }
    }
    
    drawSelection(shape) {
        this.ctx.save();
        this.ctx.strokeStyle = '#007bff';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        let bounds = this.getShapeBounds(shape);
        this.ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
        
        this.ctx.restore();
    }
    
    getShapeBounds(shape) {
        switch (shape.type) {
            case 'rectangle':
                return {
                    x: shape.x,
                    y: shape.y,
                    width: shape.width,
                    height: shape.height
                };
                
            case 'circle':
                return {
                    x: shape.x - shape.radius,
                    y: shape.y - shape.radius,
                    width: shape.radius * 2,
                    height: shape.radius * 2
                };
                
            case 'ellipse':
                return {
                    x: shape.x - shape.radiusX,
                    y: shape.y - shape.radiusY,
                    width: shape.radiusX * 2,
                    height: shape.radiusY * 2
                };
                
            case 'triangle':
            case 'star':
            case 'arrow':
            case 'pentagon':
            case 'hexagon':
            case 'diamond':
            case 'polygon':
                const xs = shape.points.map(p => p.x);
                const ys = shape.points.map(p => p.y);
                return {
                    x: Math.min(...xs),
                    y: Math.min(...ys),
                    width: Math.max(...xs) - Math.min(...xs),
                    height: Math.max(...ys) - Math.min(...ys)
                };
                
            case 'line':
                return {
                    x: Math.min(shape.x1, shape.x2),
                    y: Math.min(shape.y1, shape.y2),
                    width: Math.abs(shape.x2 - shape.x1),
                    height: Math.abs(shape.y2 - shape.y1)
                };
                
            default:
                return { x: 0, y: 0, width: 0, height: 0 };
        }
    }
    
    setTool(tool) {
        this.currentTool = tool;
        this.selectedShape = null;
        this.render();
    }

    // 缩放控制
    setZoom(z) {
        const clamped = Math.max(0.2, Math.min(5, z));
        this.zoom = clamped;
        this.render();
    }
    zoomIn() { this.setZoom(this.zoom * 1.2); }
    zoomOut() { this.setZoom(this.zoom / 1.2); }
    resetZoom() { this.zoom = 1; this.panX = 0; this.panY = 0; this.render(); }
    
    setStyle(style) {
        Object.assign(this.currentStyle, style);
        
        // 如果有选中的图形，更新其样式
        if (this.selectedShape) {
            this.pushHistory();
            Object.assign(this.selectedShape, style);
            this.render();
        }
    }

    // 统一设置填充样式类型与选项
    setFillStyle(fillType, fillOptions = {}) {
        this.currentStyle.fillType = fillType;
        this.currentStyle.fillOptions = Object.assign({}, this.currentStyle.fillOptions, fillOptions);
        // 更新选中图形（若有）
        if (this.selectedShape) {
            this.pushHistory();
            this.selectedShape.fillType = fillType;
            this.selectedShape.fillOptions = JSON.parse(JSON.stringify(this.currentStyle.fillOptions));
        }
        this.render();
    }

    // 快捷：设为纯色填充
    setFillSolid(color) {
        this.setFillStyle('solid', {});
        this.setStyle({ fillColor: color });
    }

    // 快捷：线性渐变
    setFillLinearGradient({ colors = ['#3498db', '#8e44ad'], stops = [0, 1], angle = 0 } = {}) {
        this.setFillStyle('linearGradient', { colors, stops, angle });
    }

    // 快捷：径向渐变
    setFillRadialGradient({ colors = ['#3498db', '#ffffff'], stops = [0, 1], innerRatio = 0 } = {}) {
        this.setFillStyle('radialGradient', { colors, stops, innerRatio });
    }

    // 快捷：条纹图案
    setFillPatternStripes({ colors = ['#ffffff', '#3498db'], stripeWidth = 8, angle = 0 } = {}) {
        this.setFillStyle('patternStripes', { colors, stripeWidth, angle });
    }

    // 快捷：圆点图案
    setFillPatternDots({ bgColor = '#ffffff', dotColor = '#3498db', dotRadius = 3, spacing = 12 } = {}) {
        this.setFillStyle('patternDots', { bgColor, dotColor, dotRadius, spacing });
    }

    // 设置标注样式（点尺寸与编号等）
    setAnnotationStyle(style) {
        Object.assign(this.annotationStyle, style);
        this.render();
    }
    
    deleteSelected() {
        if (this.selectedShape) {
            const index = this.shapes.indexOf(this.selectedShape);
            if (index > -1) {
                this.pushHistory();
                this.shapes.splice(index, 1);
                this.selectedShape = null;
                this.render();
                // 保存数据到本地存储
                this.saveToStorage();
            }
        }
    }
    
    clearAll() {
        this.pushHistory();
        this.shapes = [];
        this.selectedShape = null;
        this.render();
        // 保存数据到本地存储
        this.saveToStorage();
    }
    
    exportToSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', this.canvas.width);
        svg.setAttribute('height', this.canvas.height);
        svg.setAttribute('viewBox', `0 0 ${this.canvas.width} ${this.canvas.height}`);
        
        this.shapes.forEach(shape => {
            const element = this.createSVGElement(shape);
            if (element) {
                svg.appendChild(element);
            }
        });
        
        return new XMLSerializer().serializeToString(svg);
    }

    // 数据持久化方法
    saveToStorage() {
        try {
            const data = {
                shapes: this.shapes,
                globalAnnotations: this.globalAnnotations,
                timestamp: Date.now()
            };
            localStorage.setItem('iconGenerator_canvasData', JSON.stringify(data));
        } catch (error) {
            console.warn('无法保存画布数据到本地存储:', error);
        }
    }

    loadFromStorage() {
        try {
            const savedData = localStorage.getItem('iconGenerator_canvasData');
            if (savedData) {
                const data = JSON.parse(savedData);
                if (data.shapes && Array.isArray(data.shapes)) {
                    this.shapes = data.shapes;
                }
                if (data.globalAnnotations && Array.isArray(data.globalAnnotations)) {
                    this.globalAnnotations = data.globalAnnotations;
                }
            }
        } catch (error) {
            console.warn('无法从本地存储加载画布数据:', error);
            this.shapes = [];
            this.globalAnnotations = [];
        }
    }

    // 入栈当前状态，用于撤销
    pushHistory() {
        try {
            const snapshot = {
                shapes: JSON.parse(JSON.stringify(this.shapes)),
                selectedShapeId: this.selectedShape ? this.selectedShape.id : null,
                currentStyle: JSON.parse(JSON.stringify(this.currentStyle)),
                globalAnnotations: JSON.parse(JSON.stringify(this.globalAnnotations))
            };
            this.history.push(snapshot);
            if (this.history.length > 100) {
                this.history.shift();
            }
        } catch (e) {
            console.warn('无法入栈历史', e);
        }
    }

    // 撤销到上一个状态
    undo() {
        if (this.history.length === 0) return;
        const prev = this.history.pop();
        this.shapes = prev.shapes || [];
        this.currentStyle = prev.currentStyle || this.currentStyle;
        this.selectedShape = this.shapes.find(s => s.id === prev.selectedShapeId) || null;
        this.globalAnnotations = prev.globalAnnotations || [];
        this.render();
        this.saveToStorage();
    }
    
    createSVGElement(shape) {
        let element;
        
        switch (shape.type) {
            case 'rectangle':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                element.setAttribute('x', shape.x);
                element.setAttribute('y', shape.y);
                element.setAttribute('width', shape.width);
                element.setAttribute('height', shape.height);
                break;
                
            case 'circle':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                element.setAttribute('cx', shape.x);
                element.setAttribute('cy', shape.y);
                element.setAttribute('r', shape.radius);
                break;
                
            case 'triangle':
            case 'star':
            case 'arrow':
            case 'pentagon':
            case 'hexagon':
            case 'diamond':
            case 'polygon':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const points = shape.points.map(p => `${p.x},${p.y}`).join(' ');
                element.setAttribute('points', points);
                break;
                
            case 'line':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                element.setAttribute('x1', shape.x1);
                element.setAttribute('y1', shape.y1);
                element.setAttribute('x2', shape.x2);
                element.setAttribute('y2', shape.y2);
                break;
        }
        
        if (element) {
            element.setAttribute('fill', shape.fillColor);
            element.setAttribute('stroke', shape.strokeColor);
            element.setAttribute('stroke-width', shape.strokeWidth);
        }
        
        return element;
    }

    // 创建星形的点
    createStarPoints(centerX, centerY, points, outerRadius, innerRadius) {
        const starPoints = [];
        const angleStep = (Math.PI * 2) / points;
        
        for (let i = 0; i < points * 2; i++) {
            const angle = i * angleStep / 2 - Math.PI / 2;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            starPoints.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius
            });
        }
        
        return starPoints;
    }

    // 创建正多边形的点
    createPolygonPoints(centerX, centerY, sides, radius) {
        const points = [];
        const angleStep = (Math.PI * 2) / sides;
        
        for (let i = 0; i < sides; i++) {
            const angle = i * angleStep - Math.PI / 2;
            points.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius
            });
        }
        
        return points;
    }

    // 切割：沿垂直线 x = cutX 将图形切割为左右两部分
    cutAtX(cutX) {
        const newShapes = [];
        const toRemove = [];

        for (const shape of this.shapes) {
            switch (shape.type) {
                case 'rectangle': {
                    const left = this.clipPolygonVertical(this.rectToPoints(shape), cutX, 'left');
                    const right = this.clipPolygonVertical(this.rectToPoints(shape), cutX, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) {
                        toRemove.push(shape);
                        newShapes.push(...created);
                    }
                    break;
                }
                case 'triangle':
                case 'star':
                case 'arrow':
                case 'pentagon':
                case 'hexagon':
                case 'diamond': {
                    const pts = shape.points;
                    const left = this.clipPolygonVertical(pts, cutX, 'left');
                    const right = this.clipPolygonVertical(pts, cutX, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) {
                        toRemove.push(shape);
                        newShapes.push(...created);
                    }
                    break;
                }
                case 'circle': {
                    const pts = this.approximateCirclePoints(shape.x, shape.y, shape.radius, 36);
                    const left = this.clipPolygonVertical(pts, cutX, 'left');
                    const right = this.clipPolygonVertical(pts, cutX, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) {
                        toRemove.push(shape);
                        newShapes.push(...created);
                    }
                    break;
                }
                case 'ellipse': {
                    const pts = this.approximateEllipsePoints(shape.x, shape.y, shape.radiusX, shape.radiusY, 36);
                    const left = this.clipPolygonVertical(pts, cutX, 'left');
                    const right = this.clipPolygonVertical(pts, cutX, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) {
                        toRemove.push(shape);
                        newShapes.push(...created);
                    }
                    break;
                }
                case 'line': {
                    const x1 = shape.x1, y1 = shape.y1;
                    const x2 = shape.x2, y2 = shape.y2;
                    const minX = Math.min(x1, x2);
                    const maxX = Math.max(x1, x2);
                    if (cutX > minX && cutX < maxX) {
                        const t = (cutX - x1) / (x2 - x1);
                        const iy = y1 + t * (y2 - y1);
                        const line1 = {
                            id: Date.now() + Math.random(),
                            type: 'line',
                            x1: x1,
                            y1: y1,
                            x2: cutX,
                            y2: iy,
                            fillColor: shape.fillColor,
                            strokeColor: shape.strokeColor,
                            strokeWidth: shape.strokeWidth
                        };
                        const line2 = {
                            id: Date.now() + Math.random(),
                            type: 'line',
                            x1: cutX,
                            y1: iy,
                            x2: x2,
                            y2: y2,
                            fillColor: shape.fillColor,
                            strokeColor: shape.strokeColor,
                            strokeWidth: shape.strokeWidth
                        };
                        toRemove.push(shape);
                        newShapes.push(line1, line2);
                    }
                    break;
                }
            }
        }

        if (toRemove.length > 0) {
            this.shapes = this.shapes.filter(s => !toRemove.includes(s));
            this.shapes.push(...newShapes);
        }
    }

    rectToPoints(shape) {
        return [
            { x: shape.x, y: shape.y },
            { x: shape.x + shape.width, y: shape.y },
            { x: shape.x + shape.width, y: shape.y + shape.height },
            { x: shape.x, y: shape.y + shape.height }
        ];
    }

    createPolygonsFromClips(leftPts, rightPts, sourceShape) {
        const created = [];
        const baseStyle = {
            fillColor: sourceShape.fillColor,
            strokeColor: sourceShape.strokeColor,
            strokeWidth: sourceShape.strokeWidth
        };
        if (leftPts && leftPts.length >= 3) {
            created.push({ id: Date.now() + Math.random(), type: 'polygon', points: leftPts, ...baseStyle });
        }
        if (rightPts && rightPts.length >= 3) {
            created.push({ id: Date.now() + Math.random(), type: 'polygon', points: rightPts, ...baseStyle });
        }
        return created;
    }

    clipPolygonVertical(points, cutX, side = 'left') {
        if (!points || points.length === 0) return [];
        const keepLeft = side === 'left';
        const result = [];
        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const prev = points[(i + points.length - 1) % points.length];
            const currInside = keepLeft ? current.x <= cutX : current.x >= cutX;
            const prevInside = keepLeft ? prev.x <= cutX : prev.x >= cutX;

            if (currInside) {
                if (!prevInside) {
                    const inter = this.intersectSegmentWithVerticalLine(prev, current, cutX);
                    if (inter) result.push(inter);
                }
                result.push(current);
            } else if (prevInside) {
                const inter = this.intersectSegmentWithVerticalLine(prev, current, cutX);
                if (inter) result.push(inter);
            }
        }
        return result;
    }

    intersectSegmentWithVerticalLine(p1, p2, cutX) {
        if (p1.x === p2.x) {
            return { x: cutX, y: p1.y };
        }
        const t = (cutX - p1.x) / (p2.x - p1.x);
        const y = p1.y + t * (p2.y - p1.y);
        return { x: cutX, y };
    }

    approximateCirclePoints(cx, cy, r, segments = 36) {
        const pts = [];
        for (let i = 0; i < segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            pts.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
        }
        return pts;
    }

    approximateEllipsePoints(cx, cy, rx, ry, segments = 36) {
        const pts = [];
        for (let i = 0; i < segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            pts.push({ x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry });
        }
        return pts;
    }

    // 通用线段切割：沿线段 (x1,y1)-(x2,y2) 切割所有图形
    cutBySegment(x1, y1, x2, y2) {
        const p1 = { x: x1, y: y1 };
        const p2 = { x: x2, y: y2 };
        const newShapes = [];
        const toRemove = [];

        for (const shape of this.shapes) {
            switch (shape.type) {
                case 'rectangle': {
                    const pts = this.rectToPoints(shape);
                    const left = this.clipPolygonByLine(pts, p1, p2, 'left');
                    const right = this.clipPolygonByLine(pts, p1, p2, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) { toRemove.push(shape); newShapes.push(...created); }
                    break;
                }
                case 'triangle':
                case 'star':
                case 'arrow':
                case 'pentagon':
                case 'hexagon':
                case 'diamond':
                case 'polygon': {
                    const pts = shape.points;
                    const left = this.clipPolygonByLine(pts, p1, p2, 'left');
                    const right = this.clipPolygonByLine(pts, p1, p2, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) { toRemove.push(shape); newShapes.push(...created); }
                    break;
                }
                case 'circle': {
                    const pts = this.approximateCirclePoints(shape.x, shape.y, shape.radius, 36);
                    const left = this.clipPolygonByLine(pts, p1, p2, 'left');
                    const right = this.clipPolygonByLine(pts, p1, p2, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) { toRemove.push(shape); newShapes.push(...created); }
                    break;
                }
                case 'ellipse': {
                    const pts = this.approximateEllipsePoints(shape.x, shape.y, shape.radiusX, shape.radiusY, 36);
                    const left = this.clipPolygonByLine(pts, p1, p2, 'left');
                    const right = this.clipPolygonByLine(pts, p1, p2, 'right');
                    const created = this.createPolygonsFromClips(left, right, shape);
                    if (created.length > 0) { toRemove.push(shape); newShapes.push(...created); }
                    break;
                }
                case 'line': {
                    const a = { x: shape.x1, y: shape.y1 };
                    const b = { x: shape.x2, y: shape.y2 };
                    const sa = this.lineSide(a, p1, p2);
                    const sb = this.lineSide(b, p1, p2);
                    if (sa === 0 && sb === 0) {
                        // 共线：不切割
                        break;
                    }
                    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
                        const inter = this.intersectSegmentWithLine(a, b, p1, p2);
                        if (inter) {
                            const line1 = {
                                id: Date.now() + Math.random(), type: 'line',
                                x1: a.x, y1: a.y, x2: inter.x, y2: inter.y,
                                fillColor: shape.fillColor, strokeColor: shape.strokeColor, strokeWidth: shape.strokeWidth
                            };
                            const line2 = {
                                id: Date.now() + Math.random(), type: 'line',
                                x1: inter.x, y1: inter.y, x2: b.x, y2: b.y,
                                fillColor: shape.fillColor, strokeColor: shape.strokeColor, strokeWidth: shape.strokeWidth
                            };
                            toRemove.push(shape);
                            newShapes.push(line1, line2);
                        }
                    }
                    break;
                }
            }
        }

        if (toRemove.length > 0) {
            this.shapes = this.shapes.filter(s => !toRemove.includes(s));
            this.shapes.push(...newShapes);
        }
    }

    // Sutherland–Hodgman 半平面裁剪（相对线段方向的左或右侧）
    clipPolygonByLine(points, l1, l2, side = 'left') {
        if (!points || points.length === 0) return [];
        const keepLeft = side === 'left';
        const result = [];
        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const prev = points[(i + points.length - 1) % points.length];
            const currInside = keepLeft ? this.lineSide(current, l1, l2) >= 0 : this.lineSide(current, l1, l2) <= 0;
            const prevInside = keepLeft ? this.lineSide(prev, l1, l2) >= 0 : this.lineSide(prev, l1, l2) <= 0;

            if (currInside) {
                if (!prevInside) {
                    const inter = this.intersectSegmentWithLine(prev, current, l1, l2);
                    if (inter) result.push(inter);
                }
                result.push(current);
            } else if (prevInside) {
                const inter = this.intersectSegmentWithLine(prev, current, l1, l2);
                if (inter) result.push(inter);
            }
        }
        return result;
    }

    // 计算点相对定向线 l1->l2 的侧别：>0 左侧，<0 右侧，0 在线上
    lineSide(p, l1, l2) {
        const dx = l2.x - l1.x;
        const dy = l2.y - l1.y;
        return dx * (p.y - l1.y) - dy * (p.x - l1.x);
    }

    // 线段与无限直线的交点
    intersectSegmentWithLine(p1, p2, l1, l2) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = l1.x, y3 = l1.y;
        const x4 = l2.x, y4 = l2.y;
        const dx1 = x2 - x1, dy1 = y2 - y1;
        const dx2 = x4 - x3, dy2 = y4 - y3;
        const den = dx1 * dy2 - dy1 * dx2;
        if (den === 0) return null;
        const t = ((x3 - x1) * dy2 - (y3 - y1) * dx2) / den;
        return { x: x1 + t * dx1, y: y1 + t * dy1 };
    }
}