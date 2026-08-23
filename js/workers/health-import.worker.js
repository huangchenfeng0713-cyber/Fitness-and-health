/**
 * Apple 健康导入 Worker
 *
 * 「健康」App 导出的 导出.zip 里，export.xml 解压后常有几百 MB 到数 GB，
 * 直接 DOMParser 会直接把标签页打挂。这里的做法是：
 *   ZIP 中央目录定位 → Blob.slice 出压缩数据 → DecompressionStream('deflate-raw')
 *   → TextDecoderStream → 分块扫描 <Record .../> → 按天聚合
 * 全程流式，内存占用与文件大小无关。
 */

import {
  createAggregator,
  feedXmlChunk,
  parseHealthJson,
  parseHealthCsv,
} from '../core/health.js';

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_CENTRAL = 0x02014b50;

const post = (type, payload) => self.postMessage({ type, ...payload });

async function readSlice(file, start, end) {
  const buf = await file.slice(start, Math.min(end, file.size)).arrayBuffer();
  return new DataView(buf);
}

/** 在文件尾部倒着找 EOCD 签名（注释最长 64KB） */
async function findEOCD(file) {
  const maxBack = Math.min(file.size, 66 * 1024);
  const view = await readSlice(file, file.size - maxBack, file.size);
  for (let i = view.byteLength - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      return { view, offset: i, base: file.size - maxBack };
    }
  }
  return null;
}

/** 解析 ZIP 中央目录，返回条目列表 */
async function readCentralDirectory(file) {
  const eocd = await findEOCD(file);
  if (!eocd) throw new Error('这不是一个有效的 zip 文件');

  let entryCount = eocd.view.getUint16(eocd.offset + 10, true);
  let cdSize = eocd.view.getUint32(eocd.offset + 12, true);
  let cdOffset = eocd.view.getUint32(eocd.offset + 16, true);

  // ZIP64：字段被写成全 F 时要去读 ZIP64 结尾记录
  if (cdOffset === 0xffffffff || entryCount === 0xffff || cdSize === 0xffffffff) {
    const locAbs = eocd.base + eocd.offset - 20;
    if (locAbs >= 0) {
      const loc = await readSlice(file, locAbs, locAbs + 20);
      if (loc.getUint32(0, true) === SIG_EOCD64_LOCATOR) {
        const z64Offset = Number(loc.getBigUint64(8, true));
        const z64 = await readSlice(file, z64Offset, z64Offset + 56);
        if (z64.getUint32(0, true) === SIG_EOCD64) {
          entryCount = Number(z64.getBigUint64(32, true));
          cdSize = Number(z64.getBigUint64(40, true));
          cdOffset = Number(z64.getBigUint64(48, true));
        }
      }
    }
  }

  const cd = await readSlice(file, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder('utf-8');
  const entries = [];
  let p = 0;
  for (let i = 0; i < entryCount && p + 46 <= cd.byteLength; i += 1) {
    if (cd.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = cd.getUint16(p + 10, true);
    let compressedSize = cd.getUint32(p + 20, true);
    let uncompressedSize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);

    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen);
    const name = decoder.decode(nameBytes);

    // ZIP64 扩展字段
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      let e = p + 46 + nameLen;
      const extraEnd = e + extraLen;
      while (e + 4 <= extraEnd) {
        const headerId = cd.getUint16(e, true);
        const size = cd.getUint16(e + 2, true);
        if (headerId === 0x0001) {
          let q = e + 4;
          if (uncompressedSize === 0xffffffff) { uncompressedSize = Number(cd.getBigUint64(q, true)); q += 8; }
          if (compressedSize === 0xffffffff) { compressedSize = Number(cd.getBigUint64(q, true)); q += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(cd.getBigUint64(q, true)); q += 8; }
          break;
        }
        e += 4 + size;
      }
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 由本地文件头算出真实数据起点（中央目录里的名字长度可能与本地头不同） */
async function dataRange(file, entry) {
  const lh = await readSlice(file, entry.localOffset, entry.localOffset + 30);
  const nameLen = lh.getUint16(26, true);
  const extraLen = lh.getUint16(28, true);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  return { start, end: start + entry.compressedSize };
}

/** 把 zip 中的某个条目变成解压后的字节流 */
function decompressStream(file, entry, range) {
  const raw = file.slice(range.start, range.end).stream();
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`暂不支持的压缩方式（method=${entry.method}），请先手动解压再上传 export.xml`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持流式解压，请先手动解压 zip，再上传里面的 export.xml');
  }
  return raw.pipeThrough(new DecompressionStream('deflate-raw'));
}

/** 流式扫描 XML，边读边聚合 */
async function consumeXmlStream(stream, totalBytes, onProgress) {
  const aggregator = createAggregator();
  const reader = stream.pipeThrough(new TextDecoderStream('utf-8')).getReader();
  let tail = '';
  let bytes = 0;
  let lastReport = 0;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    tail = feedXmlChunk(tail + value, aggregator);
    if (bytes - lastReport > 4 * 1024 * 1024) {
      lastReport = bytes;
      onProgress?.({ bytes, totalBytes, days: aggregator.size });
    }
  }
  // 文件若在半个 Record 标签处截断，丢弃残片；不能人工补一个 “>” 把损坏数据伪装成有效记录。
  return aggregator.result();
}

/** 处理 .zip */
async function importZip(file) {
  post('progress', { stage: '正在读取压缩包目录…', pct: 2 });
  const entries = await readCentralDirectory(file);
  const target = entries.find((e) => /(^|\/)(export|导出)\.xml$/i.test(e.name))
    || entries.find((e) => e.name.toLowerCase().endsWith('.xml') && !/cda/i.test(e.name));
  if (!target) {
    throw new Error(`压缩包里没找到 export.xml。里面的文件：${entries.slice(0, 8).map((e) => e.name).join('、')}`);
  }

  post('progress', { stage: `正在解压并解析 ${target.name}…`, pct: 5 });
  const range = await dataRange(file, target);
  const stream = decompressStream(file, target, range);
  const total = target.uncompressedSize || 0;

  return consumeXmlStream(stream, total, ({ bytes, totalBytes, days }) => {
    const pct = totalBytes > 0 ? Math.min(96, 5 + (bytes / totalBytes) * 90) : 50;
    post('progress', {
      stage: `已解析 ${(bytes / 1048576).toFixed(0)} MB，覆盖 ${days} 天`,
      pct,
    });
  });
}

/** 处理裸 .xml */
async function importXml(file) {
  post('progress', { stage: '正在解析 export.xml…', pct: 5 });
  return consumeXmlStream(file.stream(), file.size, ({ bytes, totalBytes, days }) => {
    post('progress', {
      stage: `已解析 ${(bytes / 1048576).toFixed(0)} MB，覆盖 ${days} 天`,
      pct: Math.min(96, 5 + (bytes / Math.max(totalBytes, 1)) * 90),
    });
  });
}

self.onmessage = async (event) => {
  const { file, text } = event.data || {};
  try {
    let result;
    if (text != null) {
      const trimmed = text.trim();
      result = trimmed.startsWith('{') || trimmed.startsWith('[')
        ? parseHealthJson(JSON.parse(trimmed))
        : parseHealthCsv(trimmed);
    } else if (!file) {
      throw new Error('没有收到文件');
    } else {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.zip')) result = await importZip(file);
      else if (name.endsWith('.xml')) result = await importXml(file);
      else if (name.endsWith('.json')) result = parseHealthJson(JSON.parse(await file.text()));
      else if (name.endsWith('.csv')) result = parseHealthCsv(await file.text());
      else throw new Error('不认识的文件类型，请上传 zip / xml / json / csv');
    }
    post('progress', { stage: '正在写入本地数据库…', pct: 98 });
    post('done', { result });
  } catch (err) {
    post('error', { message: err?.message || String(err) });
  }
};
