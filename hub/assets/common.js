// 糊涂蛋工具箱 · 公共脚本
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function fmtSize(n) {
    if (n == null || isNaN(n)) return '-';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name || 'download';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  var EGG = '<svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">' +
    '<ellipse cx="15" cy="19" rx="12.5" ry="14" fill="#ffc53d" stroke="#2b2118" stroke-width="2.6"/>' +
    '<circle cx="10.6" cy="17" r="1.9" fill="#2b2118"/>' +
    '<circle cx="19.4" cy="17" r="1.9" fill="#2b2118"/>' +
    '<path d="M12 22.4q3 2.6 6 0" fill="none" stroke="#2b2118" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="7.4" cy="21" r="2" fill="#ff9db5" opacity=".75"/>' +
    '<circle cx="22.6" cy="21" r="2" fill="#ff9db5" opacity=".75"/></svg>';

  function paintEggs() {
    $$('[data-egg]').forEach(function (n) { n.innerHTML = EGG; });
  }

  function setupDrop(zone, onFiles) {
    if (!zone) return;
    var input = $('input[type=file]', zone);
    if (input) {
      input.addEventListener('change', function () {
        if (input.files && input.files.length) onFiles(Array.prototype.slice.call(input.files));
        input.value = '';
      });
    }
    zone.addEventListener('click', function (e) {
      if (e.target.closest('button,a')) return;
      if (input) input.click();
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); });
    });
    zone.addEventListener('drop', function (e) {
      var fs = e.dataTransfer && e.dataTransfer.files;
      if (fs && fs.length) onFiles(Array.prototype.slice.call(fs));
    });
  }

  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { res({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('图片读不出来，可能格式不支持')); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (res) {
      canvas.toBlob(function (b) { res(b); }, type, quality);
    });
  }

  function saveName(name, ext) {
    var base = (name || 'file').replace(/\.[^.]+$/, '');
    return base + '.' + ext;
  }

  // 各工具页共用的下方导航
  var TOOLS = [
    { id: 'image-compress', icon: '🗜️', name: '图片压缩到指定大小', desc: '压到 20k / 50k / 100k / 200k，压完直接下载', color: '#ffc53d' },
    { id: 'image-resize', icon: '📐', name: '图片改尺寸', desc: '一寸二寸、800×800、公众号封面，都能改', color: '#7fd1b9' },
    { id: 'image-convert', icon: '🔁', name: '图片格式转换', desc: 'heic 转 jpg、webp 转 png，苹果图也能转', color: '#8ab6e8' },
    { id: 'image-to-pdf', icon: '📄', name: '图片转 PDF', desc: '多张图合成一个 PDF，可排序，A4 排好', color: '#ffb0c8' },
    { id: 'pdf-merge', icon: '🧩', name: 'PDF 合并与拆分', desc: '几个 PDF 合成一个，或者只要某几页', color: '#ff7a45' }
  ];

  window.FT = {
    $: $, $$: $$, fmtSize: fmtSize, download: download, toast: toast,
    setupDrop: setupDrop, loadImage: loadImage, canvasToBlob: canvasToBlob,
    saveName: saveName, TOOLS: TOOLS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintEggs);
  } else {
    paintEggs();
  }
})();