// Lightweight i18n helper for extension pages and local preview (fallback)
(function() {
  const hasChromeI18n = typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function';
  const uiLang = hasChromeI18n && typeof chrome.i18n.getUILanguage === 'function'
    ? chrome.i18n.getUILanguage()
    : (navigator.language || 'en');
  const lang = uiLang.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';

  // Fallback messages for preview outside extension context
  const FALLBACK = {
    en: {
      app_name: "Shape Canvas Tool",
      app_description: "Design and export SVG/PNG icons directly in the browser",
      action_title: "Shape Canvas Tool",
      popup_page_title: "Shape Canvas Tool",
      brand_title: "Shape Canvas Tool",
      brand_subtitle: "Easy Drawing · Beautiful Export",
      shortcuts_help: "Keyboard Shortcuts",
      toolbar_basic_shapes: "Basic Shapes",
      rectangle: "Rectangle",
      circle: "Circle",
      ellipse: "Ellipse",
      triangle: "Triangle",
      star: "Star",
      arrow: "Arrow",
      pentagon: "Pentagon",
      hexagon: "Hexagon",
      diamond: "Diamond",
      line: "Line",
      toolbar_actions: "Actions",
      select: "Select",
      annotate: "Annotate",
      annotate_tooltip: "Annotate points on shapes",
      cut: "Cut",
      delete: "Delete",
      undo: "Undo",
      clear: "Clear",
      toolbar_view: "View",
      zoom_in: "Zoom In",
      zoom_in_title: "Zoom in (Ctrl +)",
      zoom_out: "Zoom Out",
      zoom_out_title: "Zoom out (Ctrl -)",
      zoom_reset: "Reset",
      zoom_reset_title: "Reset view",
      properties_color: "Colors",
      fill_color_label: "Fill:",
      stroke_color_label: "Stroke:",
      stroke_width_label: "Stroke width:",
      color_picker_title: "Color Picker",
      precise_color_picker_title: "Precise color picker",
      quick_select_title: "Quick Select",
      color_red: "Red",
      color_blue: "Blue",
      color_green: "Green",
      color_orange: "Orange",
      color_purple: "Purple",
      color_cyan: "Cyan",
      color_dark_gray: "Dark Gray",
      color_light_gray: "Light Gray",
      color_black: "Black",
      color_white: "White",
      export_section: "Export",
      export_svg: "Export SVG",
      export_png: "Export PNG",
      shortcuts_modal_title: "Keyboard Shortcuts",
      shortcuts_close_label: "Close",
      shortcuts_item_select_tool: "V or Esc: Select tool",
      shortcuts_item_shape_keys: "R: Rectangle; C: Circle; T: Triangle; L: Line; X: Cut",
      shortcuts_item_delete: "Delete / Backspace: Delete selected shape",
      shortcuts_item_export_undo: "Ctrl + S: Export SVG; Ctrl + Z: Undo",
      shortcuts_item_wheel_zoom: "Mouse wheel: Zoom view",
      notif_undo_success: "Undid last action",
      confirm_clear_all: "Clear all shapes?",
      notif_export_svg_success: "SVG exported!",
      notif_export_svg_error: "SVG export failed, please try again",
      notif_export_png_success: "PNG exported!",
      notif_export_png_error: "PNG export failed, please try again",
      generate_icons_page_title: "Icon Generator",
      icons_h1_title: "🎨 Extension Icon Generator",
      instructions_title: "How to use:",
      instructions_item1: "Click the \"Generate All Icons\" button below",
      instructions_item2: "Download PNG icons in 16x16, 32x32, 48x48, 128x128 sizes",
      instructions_item3: "Rename files to icon16.png, icon32.png, icon48.png, icon128.png",
      instructions_item4: "Place them in the extension's icons folder",
      generate_all_button: "Generate All Icons",
      download_png_button: "Download PNG"
    },
    zh_CN: {
      app_name: "图形画板工具",
      app_description: "在浏览器内直接设计并导出SVG/PNG图标的设计工具",
      action_title: "图形画板工具",
      popup_page_title: "图形画板工具",
      brand_title: "图形画板工具",
      brand_subtitle: "轻松绘制 · 精美导出",
      shortcuts_help: "快捷键说明",
      toolbar_basic_shapes: "基础形状",
      rectangle: "矩形",
      circle: "圆形",
      ellipse: "椭圆",
      triangle: "三角形",
      star: "星形",
      arrow: "箭头",
      pentagon: "五边形",
      hexagon: "六边形",
      diamond: "菱形",
      line: "直线",
      toolbar_actions: "操作工具",
      select: "选择",
      annotate: "标注",
      annotate_tooltip: "在图形上标注点",
      cut: "切割",
      delete: "删除",
      undo: "撤销",
      clear: "清空",
      toolbar_view: "视图",
      zoom_in: "放大",
      zoom_in_title: "放大 (Ctrl +)",
      zoom_out: "缩小",
      zoom_out_title: "缩小 (Ctrl -)",
      zoom_reset: "重置",
      zoom_reset_title: "重置视图",
      properties_color: "颜色",
      fill_color_label: "填充色:",
      stroke_color_label: "边框色:",
      stroke_width_label: "边框宽度:",
      color_picker_title: "颜色选择",
      precise_color_picker_title: "精确颜色选择",
      quick_select_title: "快速选择",
      color_red: "红色",
      color_blue: "蓝色",
      color_green: "绿色",
      color_orange: "橙色",
      color_purple: "紫色",
      color_cyan: "青色",
      color_dark_gray: "深灰",
      color_light_gray: "浅灰",
      color_black: "黑色",
      color_white: "白色",
      export_section: "导出",
      export_svg: "导出 SVG",
      export_png: "导出 PNG",
      shortcuts_modal_title: "快捷键说明",
      shortcuts_close_label: "关闭",
      shortcuts_item_select_tool: "V 或 Esc：选择工具",
      shortcuts_item_shape_keys: "R：矩形；C：圆形；T：三角形；L：直线；X：切割",
      shortcuts_item_delete: "Delete / Backspace：删除选中图形",
      shortcuts_item_export_undo: "Ctrl + S：导出 SVG；Ctrl + Z：撤销",
      shortcuts_item_wheel_zoom: "鼠标滚轮：缩放视图",
      notif_undo_success: "已撤销上一步",
      confirm_clear_all: "确定要清空所有图形吗？",
      notif_export_svg_success: "SVG文件已导出！",
      notif_export_svg_error: "SVG导出失败，请重试",
      notif_export_png_success: "PNG文件已导出！",
      notif_export_png_error: "PNG导出失败，请重试",
      generate_icons_page_title: "图标生成工具",
      icons_h1_title: "🎨 插件图标生成器",
      instructions_title: "使用说明：",
      instructions_item1: "点击下方的\"生成所有图标\"按钮",
      instructions_item2: "分别下载16x16、32x32、48x48、128x128尺寸的PNG图标",
      instructions_item3: "将下载的图标文件重命名为 icon16.png、icon32.png、icon48.png、icon128.png",
      instructions_item4: "将这些文件放入插件的 icons 文件夹中",
      generate_all_button: "生成所有图标",
      download_png_button: "下载 PNG"
    }
  };

  function i18n(key) {
    if (hasChromeI18n) {
      const v = chrome.i18n.getMessage(key);
      if (v) return v;
    }
    return (FALLBACK[lang] && FALLBACK[lang][key]) || (FALLBACK.en[key] || key);
  }

  function applyI18n() {
    // Set document language
    document.documentElement.setAttribute('lang', lang === 'zh_CN' ? 'zh-CN' : 'en');
    // Document title via attribute on <html>
    const docTitleKey = document.documentElement.getAttribute('data-i18n-doc-title');
    if (docTitleKey) {
      document.title = i18n(docTitleKey);
    }

    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = i18n(key);
    });

    // Inner HTML content (for mixed markup like keycaps)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      el.innerHTML = i18n(key);
    });

    // Title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', i18n(key));
    });

    // Aria-label attribute
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) el.setAttribute('aria-label', i18n(key));
    });
  }

  window.i18n = i18n;
  window.applyI18n = applyI18n;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyI18n);
  } else {
    applyI18n();
  }
})();