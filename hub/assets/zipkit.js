// 一个够用就行的 zip 读写：只做 docx 需要的那部分
// 读：支持 stored(0) / deflate(8)；写：一律 deflate-raw，压不动就 stored
(function () {
  'use strict';

  var TD = new TextDecoder('utf-8');
  var TE = new TextEncoder();

  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

  async function inflateRaw(bytes) {
    var st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }

  async function deflateRaw(bytes) {
    var st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // 找到中央目录结尾
  function findEOCD(u8) {
    var v = dv(u8);
    var start = Math.max(0, u8.length - 66000);
    for (var i = u8.length - 22; i >= start; i--) {
      if (v.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  async function readZip(arrayBuffer) {
    var u8 = new Uint8Array(arrayBuffer);
    var v = dv(u8);
    var eocd = findEOCD(u8);
    if (eocd < 0) throw new Error('这个文件不像 zip/docx，可能是老版 .doc');
    var count = v.getUint16(eocd + 10, true);
    var cdOffset = v.getUint32(eocd + 16, true);
    var p = cdOffset, out = [];
    for (var i = 0; i < count; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('zip 目录坏了');
      var flags = v.getUint16(p + 8, true);
      var method = v.getUint16(p + 10, true);
      var csize = v.getUint32(p + 20, true);
      var nameLen = v.getUint16(p + 28, true);
      var extraLen = v.getUint16(p + 30, true);
      var commentLen = v.getUint16(p + 32, true);
      var lho = v.getUint32(p + 42, true);
      var name = TD.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (v.getUint32(lho, true) !== 0x04034b50) throw new Error('zip 条目坏了：' + name);
      var lnl = v.getUint16(lho + 26, true);
      var lel = v.getUint16(lho + 28, true);
      var dataStart = lho + 30 + lnl + lel;
      var raw = u8.subarray(dataStart, dataStart + csize);
      var data, keep;
      if (method === 0) {
        data = raw.slice(); keep = true;
      } else if (method === 8) {
        data = await inflateRaw(raw);
        keep = true;
      } else {
        data = raw.slice(); keep = false;   // 不认识的压缩方式，原样保留
      }
      out.push({ name: name, data: data, method: method, raw: raw, usable: keep, flags: flags });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function writeZip(entries) {
    var parts = [], central = [], offset = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var nameB = TE.encode(e.name);
      var data = e.data;
      var crc = crc32(data);
      var comp = e.store ? data : await deflateRaw(data);
      var method = 8;
      if (comp.length >= data.length) { comp = data; method = 0; }

      var lh = new Uint8Array(30 + nameB.length);
      var lv = dv(lh);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, method, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x21, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, comp.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameB.length, true);
      lv.setUint16(28, 0, true);
      lh.set(nameB, 30);
      parts.push(lh, comp);

      var ch = new Uint8Array(46 + nameB.length);
      var cv = dv(ch);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, comp.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameB.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nameB, 46);
      central.push(ch);

      offset += lh.length + comp.length;
    }
    var cdSize = 0;
    for (var j = 0; j < central.length; j++) cdSize += central[j].length;

    var eocd = new Uint8Array(22);
    var ev = dv(eocd);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(parts.concat(central, [eocd]), { type: 'application/zip' });
  }

  window.ZIPKIT = { read: readZip, write: writeZip, crc32: crc32 };
})();