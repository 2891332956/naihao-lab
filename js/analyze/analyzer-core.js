/**
 * @file 奶蛙·奶量鉴定 —— 动作 / 运动结构比对算法核心（analyzer-core）
 *
 * ── 这个模块做什么 ──────────────────────────────────────────────────────────
 * 给定「示范视频」与「用户模仿视频」的逐帧灰度序列（解码端固定输出 64×64，
 * 灰度 0..255），比较两段视频的「动作 / 运动结构」相似度，输出 0..100 的
 * 奶家人值分数、四个 0..100 子指标与 0..1 置信度。
 *
 * 核心流程：
 *   1) 输入清洗与重采样：任意尺寸 → 64×64 最近邻比例重采样；最多取 120 帧；
 *   2) 每帧特征：
 *      a. 时间维分位数（默认中位数）估计静态背景；
 *      b. 背景差分 + 帧间运动补强 → 前景 mask（阈值按噪声稳健自适应）；
 *      c. mask 的紧致 bbox 居中、缩放为约 24×32 的「轮廓描述子」；
 *      d. bbox 归一化的 8×8「运动能量图」；
 *      e. 前景质心位移得到的「运动方向」描述子（只取方向，幅度交给 energy 指标）；
 *   3) 序列比对：DTW（Sakoe-Chiba 归一化时间带宽，默认 20%）对齐两条序列，
 *      沿最优路径统计轮廓 / 运动图 / 运动方向的平均相似度；
 *      另算运动能量包络的节奏相关性、平均运动强度比、有效动作覆盖率（完成度）；
 *   4) 水平镜像容忍：默认同时比对「正常」与「水平镜像」两个版本，取较优者；
 *   5) 指标映射 + sigmoid/幂次校准 + 质量门控 → 最终分数与置信度。
 *
 * ── 边界与局限（重要，请勿误解）────────────────────────────────────────────
 * 本算法是「动作 / 运动结构比对」，不是专业人体姿态识别：
 *   - 没有关节 / 骨架语义，无法判断动作是否“标准”（例如深蹲是否够低）；
 *   - 依赖「机位相对固定 + 背景大体静止 + 动作有可辨识的轮廓变化」；
 *     若相机剧烈摇晃、背景大面积运动、或人几乎不动，前景可能检不出，
 *     此时分数与置信度都会偏低（这是有意为之，宁可说“看不清”也不乱给高分）；
 *   - 用帧数近似时长（假定抽帧间隔均匀，可选的 t 字段当前不参与计算）；
 *   - 后续若接入姿态模型（MediaPipe / MoveNet 等），可替换本文件的特征提取
 *     部分（buildSequenceFeatures），DTW / 指标映射 / 校准框架可原样复用。
 *
 * ── 技术约束 ──────────────────────────────────────────────────────────────
 * 原生 ES Module、零第三方依赖、纯函数，不依赖 DOM / window / canvas /
 * Node 专属 API；浏览器与 Node 24 均可直接 import。
 *
 * ── 极简调用示例（无任何额外依赖）─────────────────────────────────────────
 * ```js
 * import { analyzeSequences, DEFAULT_OPTIONS } from './js/analyze/analyzer-core.js';
 *
 * // 解码端给出等间隔抽帧，每帧 64×64 灰度（Uint8ClampedArray / Float32Array / number[] 均可）
 * // const demoFrames = [{ gray, width: 64, height: 64 }, ...];
 * // const userFrames = [{ gray, width: 64, height: 64 }, ...];
 * const result = analyzeSequences(demoFrames, userFrames);
 * console.log(result.score);                 // 0..100，保留 1 位小数
 * console.log(result.metrics);               // { action, rhythm, energy, completion }
 * console.log(result.confidence);            // 0..1
 *
 * // 覆盖参数（任意字段可选，只传需要覆盖的部分即可）：
 * // analyzeSequences(demoFrames, userFrames, {
 * //   weights: { action: 0.6, rhythm: 0.15, energy: 0.15, completion: 0.1 },
 * //   mirrorInvariant: false,
 * //   maxFrames: 120,
 * // });
 * ```
 */

/** 算法核心版本号（区别于网站版本，便于 Lead 对接与后续替换） */
export const ANALYZER_VERSION = '0.1.0';

/** 数值容差 */
const EPS = 1e-9;

/** 单边来源尺寸上限（防御异常输入导致超大内存） */
const MAX_SOURCE_DIM = 4096;

/**
 * 默认参数表（全部字段均可通过 analyzeSequences 的 options 覆盖）。
 *
 * 评分相关：
 * - weights：四个指标在总分中的权重（内部会归一化，不要求和为 1）
 * - actionWeights：action 指标内部「轮廓 / 运动图 / 运动方向 / 归一化轨迹」的权重
 * - actionCenter / actionSteepness：action 相似度 → 0..100 的 sigmoid 映射参数
 * - actionQuantileWeight：动作相似度中「最差 25% 片段」的惩罚占比（防止一小段像就高分）
 * - trajectoryTimingWeight：归一化时间轨迹形状不匹配时的最大惩罚比例（0 可关闭该惩罚）
 * - scoreGamma：总分校准幂次（>1 会压低中低分段，避免大量样本挤在 60~70）
 *
 * 特征相关：
 * - targetSize：内部统一灰度分辨率（默认 64）
 * - featureWidth / featureHeight：归一化轮廓描述子尺寸（24×32）
 * - motionGridSize：运动能量图网格尺寸（8×8）
 * - maxFrames：单条序列最多使用的帧数（均匀抽样，默认 120）
 * - minFrames：帧数低于它视为“太短”，置信度与质量分下降
 * - foregroundThreshold：背景差分基础阈值（0..255）
 * - foregroundSigmaMultiplier：噪声稳健阈值系数（阈值 = max(基础阈值, 系数×噪声σ)）
 * - backgroundPercentile：背景估计分位数（0.5 = 时间中位数）
 * - motionNoiseFloor：运动能量图“无动作”地板（低于它视为静帧）
 * - velocityFloor：质心速度低于它视为静止（只影响方向描述子）
 *
 * 对齐/镜像：
 * - bandRatio：Sakoe-Chiba 带宽（按归一化时间，默认 0.2，可适应时长不同的视频）
 * - mirrorInvariant：是否默认开启水平镜像容忍（手机前摄镜像视频）
 *
 * 输出上下限：
 * - maxScore：分数上限（避免“完全一样”直接 100，默认 99.5）
 */
export const DEFAULT_OPTIONS = {
  weights: { action: 0.55, rhythm: 0.2, energy: 0.15, completion: 0.1 },
  actionWeights: { shape: 0.3, motion: 0.2, velocity: 0.25, trajectory: 0.25 },
  actionCenter: 0.62,
  actionSteepness: 8,
  actionQuantileWeight: 0.3,
  trajectoryTimingWeight: 0.4,
  scoreGamma: 1.6,
  maxScore: 99.5,

  targetSize: 64,
  featureWidth: 24,
  featureHeight: 32,
  motionGridSize: 8,
  maxFrames: 120,
  minFrames: 6,
  backgroundPercentile: 0.5,
  foregroundThreshold: 12,
  foregroundSigmaMultiplier: 2.5,
  motionNoiseFloor: 2,
  velocityFloor: 0.004,

  bandRatio: 0.2,
  mirrorInvariant: true,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 一、通用小工具
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 截断到 [lo, hi]。
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 截断到 [0, 1]。
 * @param {number} v
 * @returns {number}
 */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 四舍五入到指定小数位，同时把 -0 / NaN / Infinity 变成安全值。
 * @param {number} v
 * @param {number} digits
 * @returns {number}
 */
function roundTo(v, digits) {
  if (!Number.isFinite(v)) return 0;
  const p = Math.pow(10, digits);
  const r = Math.round(v * p) / p;
  return r === 0 ? 0 : r; // 去掉 -0
}

/**
 * 安全除法：分母接近 0 时返回 fallback。
 * @param {number} a
 * @param {number} b
 * @param {number} fallback
 * @returns {number}
 */
function safeDiv(a, b, fallback) {
  return Math.abs(b) < EPS ? fallback : a / b;
}

/**
 * 归一化一组权重：
 * - 未提供的键沿用默认权重，显式提供的非负数覆盖默认值（显式 0 表示禁用该维度）；
 * - 非法值（NaN/Infinity/负数/非数字）回退到默认权重；
 * - 总和为 0 时整体回退默认权重；默认也异常时退化为等权。
 * @param {unknown} input 用户传入的权重对象
 * @param {Record<string, number>} defaults 默认权重
 * @param {string[]} keys 需要保留的键
 * @returns {Record<string, number>} 和为 1 的新权重对象
 */
function normalizeWeights(input, defaults, keys) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  let sum = 0;
  for (const key of keys) {
    const hasOwn = Object.prototype.hasOwnProperty.call(src, key);
    const raw = hasOwn ? Number(src[key]) : Number.NaN;
    const value = Number.isFinite(raw) && raw >= 0 ? raw : Number(defaults[key]) || 0;
    out[key] = value;
    sum += value;
  }
  if (sum < EPS) {
    sum = 0;
    for (const key of keys) {
      out[key] = Number(defaults[key]) || 0;
      sum += out[key];
    }
  }
  if (sum < EPS) {
    const evenly = 1 / keys.length;
    for (const key of keys) out[key] = evenly;
    return out;
  }
  for (const key of keys) out[key] /= sum;
  return out;
}

/**
 * 合并并校验调用方参数（不修改传入对象，不修改 DEFAULT_OPTIONS）。
 * @param {Record<string, unknown>|null|undefined} options
 * @returns {typeof DEFAULT_OPTIONS} 完整、合法的参数对象
 */
function resolveOptions(options) {
  const src = options && typeof options === 'object' ? options : {};
  const num = (v, fallback, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
  };
  const int = (v, fallback, lo, hi) => Math.round(num(v, fallback, lo, hi));

  return {
    weights: normalizeWeights(src.weights, DEFAULT_OPTIONS.weights, [
      'action',
      'rhythm',
      'energy',
      'completion',
    ]),
    actionWeights: normalizeWeights(src.actionWeights, DEFAULT_OPTIONS.actionWeights, [
      'shape',
      'motion',
      'velocity',
      'trajectory',
    ]),
    actionCenter: num(src.actionCenter, DEFAULT_OPTIONS.actionCenter, 0.1, 0.95),
    actionSteepness: num(src.actionSteepness, DEFAULT_OPTIONS.actionSteepness, 0.5, 30),
    actionQuantileWeight: num(
      src.actionQuantileWeight,
      DEFAULT_OPTIONS.actionQuantileWeight,
      0,
      0.6,
    ),
    trajectoryTimingWeight: num(
      src.trajectoryTimingWeight,
      DEFAULT_OPTIONS.trajectoryTimingWeight,
      0,
      0.7,
    ),
    scoreGamma: num(src.scoreGamma, DEFAULT_OPTIONS.scoreGamma, 0.4, 3),
    maxScore: num(src.maxScore, DEFAULT_OPTIONS.maxScore, 50, 100),

    targetSize: int(src.targetSize, DEFAULT_OPTIONS.targetSize, 16, 128),
    featureWidth: int(src.featureWidth, DEFAULT_OPTIONS.featureWidth, 4, 64),
    featureHeight: int(src.featureHeight, DEFAULT_OPTIONS.featureHeight, 4, 64),
    motionGridSize: int(src.motionGridSize, DEFAULT_OPTIONS.motionGridSize, 3, 24),
    maxFrames: int(src.maxFrames, DEFAULT_OPTIONS.maxFrames, 8, 240),
    minFrames: int(src.minFrames, DEFAULT_OPTIONS.minFrames, 2, 60),
    backgroundPercentile: num(
      src.backgroundPercentile,
      DEFAULT_OPTIONS.backgroundPercentile,
      0.05,
      0.95,
    ),
    foregroundThreshold: num(
      src.foregroundThreshold,
      DEFAULT_OPTIONS.foregroundThreshold,
      1,
      120,
    ),
    foregroundSigmaMultiplier: num(
      src.foregroundSigmaMultiplier,
      DEFAULT_OPTIONS.foregroundSigmaMultiplier,
      0,
      10,
    ),
    motionNoiseFloor: num(src.motionNoiseFloor, DEFAULT_OPTIONS.motionNoiseFloor, 0, 60),
    velocityFloor: num(src.velocityFloor, DEFAULT_OPTIONS.velocityFloor, 0, 0.5),

    bandRatio: num(src.bandRatio, DEFAULT_OPTIONS.bandRatio, 0.02, 0.5),
    mirrorInvariant: src.mirrorInvariant === undefined ? true : !!src.mirrorInvariant,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 二、输入清洗：校验 / 尺寸推断 / 重采样 / 截帧
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 判断对象是否像「帧 + 灰度数组」。
 * @param {unknown} frame
 * @returns {{gray: ArrayLike<number>, w: number, h: number}|null}
 */
function readFrameInfo(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const anyFrame = /** @type {any} */ (frame);
  const gray = anyFrame.gray;
  if (!gray || typeof gray.length !== 'number' || gray.length <= 0) return null;
  const len = gray.length;
  let w = Math.floor(Number(anyFrame.width));
  let h = Math.floor(Number(anyFrame.height));
  // 尺寸缺失 / 与长度不一致时，尝试按正方形从长度推断，仍不合法则丢弃该帧
  if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w * h === len)) {
    const side = Math.round(Math.sqrt(len));
    if (!(side > 0 && side * side === len)) return null;
    w = side;
    h = side;
  }
  if (w > MAX_SOURCE_DIM || h > MAX_SOURCE_DIM) return null;
  return { gray, w, h };
}

/**
 * 最近邻比例重采样到 size×size，写入 out（长度 size*size），同时做数值清洗。
 * 灰度值会被截断到 0..255，非有限值按 0 处理。
 * @param {ArrayLike<number>} gray
 * @param {number} w
 * @param {number} h
 * @param {Float32Array} out
 * @param {number} size
 */
function resampleFrameTo(gray, w, h, out, size) {
  for (let y = 0; y < size; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / size));
    const row = sy * w;
    for (let x = 0; x < size; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / size));
      let v = Number(gray[row + sx]);
      if (!Number.isFinite(v)) v = 0;
      out[y * size + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}

/**
 * 均匀抽样，把数组压缩到 <= maxFrames 个元素（保留首尾）。
 * @template T
 * @param {T[]} list
 * @param {number} maxFrames
 * @returns {T[]}
 */
function subsampleFrames(list, maxFrames) {
  if (list.length <= maxFrames) return list;
  const out = [];
  const step = (list.length - 1) / (maxFrames - 1);
  for (let i = 0; i < maxFrames; i++) {
    out.push(list[Math.round(i * step)]);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 三、图像基础处理（全部为纯函数 / 只在本地分配数组）
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 3×3 可分离均值模糊（边界复制），用于抑制噪声、让轮廓/运动图对 1~2 像素抖动更稳。
 * @param {Float32Array} src 长度 w*h
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array}
 */
function blurGrid(src, w, h) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      tmp[i] = ((x > 0 ? src[i - 1] : src[i]) + src[i] + (x < w - 1 ? src[i + 1] : src[i])) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      out[i] =
        ((y > 0 ? tmp[i - w] : tmp[i]) + tmp[i] + (y < h - 1 ? tmp[i + w] : tmp[i])) / 3;
    }
  }
  return out;
}

/**
 * 时间维分位数背景估计（直方图实现，值域 0..255，分辨率 1 灰度级）。
 * @param {Float32Array[]} frames 已平滑的帧
 * @param {number} n 帧数（>=1）
 * @param {number} size 单边尺寸
 * @param {number} percentile 0..1，默认 0.5（中位数）
 * @returns {Float32Array} 长度 size*size 的背景图
 */
function estimateBackground(frames, n, size, percentile) {
  const pixels = size * size;
  const bins = 256;
  const hist = new Uint16Array(pixels * bins);
  for (let t = 0; t < n; t++) {
    const f = frames[t];
    for (let p = 0; p < pixels; p++) {
      const v = Math.round(clamp(f[p], 0, 255));
      hist[p * bins + v]++;
    }
  }

  /** 取第 k 小（0-based）的灰度值 */
  const pickOrder = (base, k) => {
    let cum = 0;
    for (let v = 0; v < bins; v++) {
      cum += hist[base + v];
      if (cum > k) return v;
    }
    return 255;
  };

  const bg = new Float32Array(pixels);
  const pos = percentile * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  const frac = pos - lo;
  for (let p = 0; p < pixels; p++) {
    const base = p * bins;
    const vLo = pickOrder(base, lo);
    const vHi = hi === lo ? vLo : pickOrder(base, hi);
    bg[p] = vLo + (vHi - vLo) * frac;
  }
  return bg;
}

/**
 * 3×3 多数表决滤波（去孤立噪点，同时保留成片前景）。
 * @param {Uint8Array} mask 长度 size*size 的二值 mask
 * @param {number} size
 * @returns {Uint8Array}
 */
function majorityFilter(mask, size) {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= size) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= size) continue;
          count += mask[yy * size + xx];
        }
      }
      out[y * size + x] = count >= 5 ? 1 : 0;
    }
  }
  return out;
}

/**
 * 计算二值 mask 的紧致包围盒与质心。
 * @param {Uint8Array} mask
 * @param {number} size
 * @returns {{x0:number,y0:number,w:number,h:number,cx:number,cy:number,count:number}|null}
 */
function maskBoundingBox(mask, size) {
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      if (mask[row + x]) {
        count++;
        sumX += x;
        sumY += y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (count === 0) return null;
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: sumX / count, cy: sumY / count, count };
}

/**
 * 把 mask 的 bbox 区域面积平均缩放到 fw×fh 的轮廓描述子（0..1 浮点）。
 * @param {Uint8Array} mask
 * @param {number} size
 * @param {{x0:number,y0:number,w:number,h:number}} box
 * @param {number} fw
 * @param {number} fh
 * @param {Float32Array} out 长度 fw*fh
 */
function resizeMaskToDescriptor(mask, size, box, fw, fh, out) {
  for (let ty = 0; ty < fh; ty++) {
    const sy0 = box.y0 + Math.floor((ty * box.h) / fh);
    let sy1 = box.y0 + Math.floor(((ty + 1) * box.h) / fh);
    if (sy1 <= sy0) sy1 = sy0 + 1;
    const yLimit = box.y0 + box.h;
    if (sy1 > yLimit) sy1 = yLimit;
    for (let tx = 0; tx < fw; tx++) {
      const sx0 = box.x0 + Math.floor((tx * box.w) / fw);
      let sx1 = box.x0 + Math.floor(((tx + 1) * box.w) / fw);
      if (sx1 <= sx0) sx1 = sx0 + 1;
      const xLimit = box.x0 + box.w;
      if (sx1 > xLimit) sx1 = xLimit;
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * size;
        for (let sx = sx0; sx < sx1; sx++) {
          sum += mask[row + sx];
          count++;
        }
      }
      out[ty * fw + tx] = count > 0 ? sum / count : 0;
    }
  }
}

/**
 * 把 bbox 归一化区域内的「帧差」面积平均缩放到 gs×gs 运动能量图。
 * @param {Float32Array} diff 当前帧对称帧差（0..255）
 * @param {number} size
 * @param {{x0:number,y0:number,w:number,h:number}} box
 * @param {number} gs 网格边长
 * @param {Float32Array} out 长度 gs*gs（未归一化，0..255 量级）
 */
function resizeDiffToGrid(diff, size, box, gs, out) {
  for (let gy = 0; gy < gs; gy++) {
    const sy0 = box.y0 + Math.floor((gy * box.h) / gs);
    let sy1 = box.y0 + Math.floor(((gy + 1) * box.h) / gs);
    if (sy1 <= sy0) sy1 = sy0 + 1;
    const yLimit = box.y0 + box.h;
    if (sy1 > yLimit) sy1 = yLimit;
    for (let gx = 0; gx < gs; gx++) {
      const sx0 = box.x0 + Math.floor((gx * box.w) / gs);
      let sx1 = box.x0 + Math.floor(((gx + 1) * box.w) / gs);
      if (sx1 <= sx0) sx1 = sx0 + 1;
      const xLimit = box.x0 + box.w;
      if (sx1 > xLimit) sx1 = xLimit;
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * size;
        for (let sx = sx0; sx < sx1; sx++) {
          sum += diff[row + sx];
          count++;
        }
      }
      out[gy * gs + gx] = count > 0 ? sum / count : 0;
    }
  }
}

/**
 * L2 归一化：原地把向量除以其 L2 范数；范数过小则清零。
 * @param {Float32Array} vec
 * @returns {number} 归一化前的 L2 范数
 */
function l2NormalizeInPlace(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  if (norm < 1e-6) {
    vec.fill(0);
    return 0;
  }
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return norm;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 四、单条序列的特征提取
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 单条序列的完整特征包（内部结构，不直接暴露给调用方）。
 * @typedef {Object} SequenceFeatures
 * @property {number} n 实际使用帧数
 * @property {number} sourceCount 输入中合法的原始帧数
 * @property {boolean} capped 是否因超过 maxFrames 被截断
 * @property {[number,number]|null} sourceSize 原始帧尺寸 [w,h]
 * @property {number} targetSize 内部统一尺寸
 * @property {Float32Array[]} contour 每帧 24×32 的 L2 归一化轮廓描述子（无前景时全 0）
 * @property {Float32Array} contourNorm 每帧轮廓描述子的原始 L2 范数（0 表示无前景）
 * @property {Float32Array[]} motionGrid 每帧 8×8 的 L2 归一化运动能量图（无运动时全 0）
 * @property {Float32Array} motionNorm 每帧运动图的 L2 范数
 * @property {Float32Array} speed 每帧质心速度（已按前景尺度归一化，单位：倍物体尺寸/帧）
 * @property {Float32Array[]} velocityDir 每帧运动方向单位向量；低速时 (0,0)
 * @property {Float32Array[]} trajPos 每帧「平移/尺度归一化后的质心轨迹」[x,y]；无前景时 (0,0)
 * @property {Uint8Array} trajActive 每帧是否有可用质心（用于轨迹比的退化处理）
 * @property {Float32Array} env 每帧前景内平均运动强度（0..255 量级）
 * @property {Uint8Array} active 每帧是否处于“有效动作”状态
 * @property {Float32Array} fgRatio 每帧前景占比
 * @property {number} envMean 前景内平均运动强度的均值
 * @property {number} fgRatioMean 前景占比均值
 * @property {number} globalMean 全序列灰度均值
 * @property {number} globalStd 全序列灰度标准差
 * @property {{usability:number, lenScore:number, motionScore:number, contrastScore:number, fgScore:number}} quality 质量分（0..1）
 */

/**
 * 空特征包（输入为空 / 全部非法时使用）。
 * @param {number} targetSize
 * @param {number} sourceCount
 * @param {boolean} capped
 * @param {[number,number]|null} sourceSize
 * @returns {SequenceFeatures}
 */
function emptyFeatures(targetSize, sourceCount, capped, sourceSize) {
  return {
    n: 0,
    sourceCount,
    capped,
    sourceSize,
    targetSize,
    contour: [],
    contourNorm: new Float32Array(0),
    motionGrid: [],
    motionNorm: new Float32Array(0),
    speed: new Float32Array(0),
    velocityDir: [],
    trajPos: [],
    trajActive: new Uint8Array(0),
    env: new Float32Array(0),
    active: new Uint8Array(0),
    fgRatio: new Float32Array(0),
    envMean: 0,
    fgRatioMean: 0,
    globalMean: 0,
    globalStd: 0,
    quality: {
      usability: 0,
      lenScore: 0,
      motionScore: 0,
      contrastScore: 0,
      fgScore: 0,
    },
  };
}

/**
 * 从原始帧数组构建单条序列的特征。
 * 任何非法输入都不会抛异常：非法帧被跳过；全部非法则返回空特征包。
 * @param {unknown} inputFrames 调用方传入的帧数组
 * @param {typeof DEFAULT_OPTIONS} opts 已校验参数
 * @returns {SequenceFeatures}
 */
function buildSequenceFeatures(inputFrames, opts) {
  const size = opts.targetSize;
  const pixels = size * size;

  // 1) 收集合法帧
  const rawList = [];
  if (Array.isArray(inputFrames)) {
    for (const raw of inputFrames) {
      const info = readFrameInfo(raw);
      if (info) rawList.push(info);
    }
  }
  const sourceCount = rawList.length;
  if (sourceCount === 0) {
    return emptyFeatures(size, 0, false, null);
  }
  const first = rawList[0];
  const sourceSize = /** @type {[number, number]} */ ([first.w, first.h]);

  // 2) 截帧（均匀抽样，保留首尾）
  const capped = sourceCount > opts.maxFrames;
  const selected = subsampleFrames(rawList, opts.maxFrames);
  const n = selected.length;

  // 3) 重采样到统一尺寸，并检测 0..1 浮点灰度（自动 ×255）
  const frames = new Array(n);
  let rawMax = 0;
  for (let t = 0; t < n; t++) {
    const out = new Float32Array(pixels);
    const info = selected[t];
    resampleFrameTo(info.gray, info.w, info.h, out, size);
    for (let p = 0; p < pixels; p++) {
      if (out[p] > rawMax) rawMax = out[p];
    }
    frames[t] = out;
  }
  const scale = rawMax > 0 && rawMax <= 1.5 ? 255 : 1;
  if (scale !== 1) {
    for (let t = 0; t < n; t++) {
      const f = frames[t];
      for (let p = 0; p < pixels; p++) f[p] = clamp(f[p] * scale, 0, 255);
    }
  }

  // 4) 平滑 + 全局统计（对比度用于质量检查）
  const smoothed = new Array(n);
  let sum = 0;
  let sumSq = 0;
  for (let t = 0; t < n; t++) {
    const sm = blurGrid(frames[t], size, size);
    smoothed[t] = sm;
    for (let p = 0; p < pixels; p++) {
      const v = sm[p];
      sum += v;
      sumSq += v * v;
    }
  }
  const sampleCount = n * pixels;
  const globalMean = sum / sampleCount;
  const globalStd = Math.sqrt(Math.max(0, sumSq / sampleCount - globalMean * globalMean));

  // 5) 时间维分位数背景
  const background = estimateBackground(smoothed, n, size, opts.backgroundPercentile);

  // 6) 逐帧前景 mask（背景差分 + 帧间运动补强，阈值按噪声稳健自适应）
  const masks = new Array(n);
  const absDiff = new Float32Array(pixels);
  const hist = new Uint16Array(256);
  for (let t = 0; t < n; t++) {
    const f = smoothed[t];
    hist.fill(0);
    for (let p = 0; p < pixels; p++) {
      const d = Math.abs(f[p] - background[p]);
      absDiff[p] = d;
      const bin = Math.min(255, Math.round(d));
      hist[bin]++;
    }
    // 中位数 |diff| 作为稳健噪声尺度（运动像素占比 < 50% 时仍然可靠）
    const half = pixels / 2;
    let cum = 0;
    let medianAbs = 0;
    for (let bin = 0; bin < 256; bin++) {
      cum += hist[bin];
      if (cum >= half) {
        medianAbs = bin;
        break;
      }
    }
    const sigma = 1.4826 * medianAbs; // MAD → σ 的稳健换算
    const threshold = Math.max(
      opts.foregroundThreshold,
      opts.foregroundSigmaMultiplier * sigma,
    );
    const mask = new Uint8Array(pixels);
    for (let p = 0; p < pixels; p++) {
      if (absDiff[p] > threshold) mask[p] = 1;
    }
    // 帧间运动补强：背景里“刚动过”的像素也纳入前景（后续轮廓归一化会处理尺度）
    const prev = t > 0 ? smoothed[t - 1] : t + 1 < n ? smoothed[t + 1] : null;
    if (prev) {
      for (let p = 0; p < pixels; p++) {
        if (mask[p] === 0 && Math.abs(f[p] - prev[p]) > threshold) mask[p] = 1;
      }
    }
    masks[t] = majorityFilter(mask, size);
  }

  // 7) 逐帧运动能量：对称帧差 → 前景内平均强度 env + bbox 归一化 8×8 运动图
  const motionGrid = new Array(n);
  const motionNorm = new Float32Array(n);
  const env = new Float32Array(n);
  const diffBuf = new Float32Array(pixels);
  const rawGrid = new Float32Array(opts.motionGridSize * opts.motionGridSize);
  for (let t = 0; t < n; t++) {
    const f = smoothed[t];
    const prevIdx = t > 0 ? t - 1 : -1;
    const nextIdx = t + 1 < n ? t + 1 : -1;
    if (prevIdx < 0 && nextIdx < 0) {
      motionGrid[t] = new Float32Array(rawGrid.length);
      env[t] = 0;
      continue;
    }
    for (let p = 0; p < pixels; p++) {
      let d = 0;
      let c = 0;
      if (prevIdx >= 0) {
        d += Math.abs(f[p] - smoothed[prevIdx][p]);
        c++;
      }
      if (nextIdx >= 0) {
        d += Math.abs(f[p] - smoothed[nextIdx][p]);
        c++;
      }
      diffBuf[p] = c > 0 ? d / c : 0;
    }
    // 运动图 / 能量只用前景 union 区域，天然抑制静止画面的传感器噪声
    const maskCur = masks[t];
    const maskOther = prevIdx >= 0 ? masks[prevIdx] : masks[nextIdx];
    const maskUnion = new Uint8Array(pixels);
    let unionCount = 0;
    let energySum = 0;
    for (let p = 0; p < pixels; p++) {
      if (maskCur[p] || (maskOther && maskOther[p])) {
        maskUnion[p] = 1;
        unionCount++;
        energySum += diffBuf[p];
      }
    }
    env[t] = unionCount > 0 ? energySum / unionCount : 0;

    const grid = new Float32Array(rawGrid.length);
    const box = unionCount > 0 ? maskBoundingBox(maskUnion, size) : null;
    if (box) {
      resizeDiffToGrid(diffBuf, size, box, opts.motionGridSize, rawGrid);
      let maxV = 0;
      for (let i = 0; i < rawGrid.length; i++) {
        if (rawGrid[i] > maxV) maxV = rawGrid[i];
      }
      if (maxV >= opts.motionNoiseFloor && maxV > 1e-6) {
        for (let i = 0; i < rawGrid.length; i++) grid[i] = rawGrid[i] / maxV;
        motionNorm[t] = l2NormalizeInPlace(grid);
      }
    }
    motionGrid[t] = grid;
  }

  // 8) 逐帧轮廓描述子 + 前景统计
  const fw = opts.featureWidth;
  const fh = opts.featureHeight;
  const contour = new Array(n);
  const contourNorm = new Float32Array(n);
  const fgRatio = new Float32Array(n);
  const centroids = new Array(n);
  const bboxSizes = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    const mask = masks[t];
    const box = maskBoundingBox(mask, size);
    const vec = new Float32Array(fw * fh);
    if (box) {
      fgRatio[t] = box.count / pixels;
      centroids[t] = { x: box.cx, y: box.cy };
      bboxSizes[t] = Math.sqrt(box.w * box.h);
      resizeMaskToDescriptor(mask, size, box, fw, fh, vec);
      const blurred = blurGrid(vec, fw, fh);
      contourNorm[t] = l2NormalizeInPlace(blurred);
      contour[t] = blurred;
    } else {
      fgRatio[t] = 0;
      centroids[t] = null;
      bboxSizes[t] = 0;
      contour[t] = vec;
    }
  }

  // 9) 质心速度 → 运动方向描述子（方向为主，幅度交给 energy 指标）
  let bboxSum = 0;
  let bboxCount = 0;
  for (let t = 0; t < n; t++) {
    if (bboxSizes[t] > 0) {
      bboxSum += bboxSizes[t];
      bboxCount++;
    }
  }
  const scalePx = Math.max(size * 0.05, bboxCount > 0 ? bboxSum / bboxCount : size * 0.25);
  // 空间上轻微平滑质心（忽略缺失帧）
  const smoothCentroid = new Array(n);
  for (let t = 0; t < n; t++) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let d = -1; d <= 1; d++) {
      const idx = t + d;
      if (idx < 0 || idx >= n) continue;
      const c = centroids[idx];
      if (!c) continue;
      const w = d === 0 ? 0.5 : 0.25;
      sx += c.x * w;
      sy += c.y * w;
      sw += w;
    }
    smoothCentroid[t] = sw > 0 ? { x: sx / sw, y: sy / sw } : null;
  }
  const speed = new Float32Array(n);
  const velocityDir = new Array(n);
  for (let t = 0; t < n; t++) {
    const cur = smoothCentroid[t];
    const dir = new Float32Array(2);
    if (!cur) {
      velocityDir[t] = dir;
      speed[t] = 0;
      continue;
    }
    const prev = t > 0 ? smoothCentroid[t - 1] : null;
    const next = t + 1 < n ? smoothCentroid[t + 1] : null;
    let dx = 0;
    let dy = 0;
    if (prev && next) {
      dx = (next.x - prev.x) / 2;
      dy = (next.y - prev.y) / 2;
    } else if (next) {
      dx = next.x - cur.x;
      dy = next.y - cur.y;
    } else if (prev) {
      dx = cur.x - prev.x;
      dy = cur.y - prev.y;
    }
    const s = Math.hypot(dx, dy) / scalePx;
    speed[t] = s;
    if (s >= opts.velocityFloor && s > 1e-6) {
      dir[0] = dx / (s * scalePx);
      dir[1] = dy / (s * scalePx);
    }
    velocityDir[t] = dir;
  }

  // 10) 归一化质心轨迹：减去轨迹均值（平移不变）、再除以轨迹自身尺度（远近/幅度不可知）。
  //     这样「轨迹形状相同、但机位/距离/幅度不同」仍然相近，而「轨迹形状不同」会明显拉开；
  //     同时配合速度方向描述子，可以区分“同一个物体走了不同路线”这类动作差异。
  let meanCx = 0;
  let meanCy = 0;
  let centroidCount = 0;
  for (let t = 0; t < n; t++) {
    const c = centroids[t];
    if (!c) continue;
    meanCx += c.x;
    meanCy += c.y;
    centroidCount++;
  }
  const minPathScale = Math.max(1.5, size * 0.03);
  const trajPos = new Array(n);
  const trajActive = new Uint8Array(n);
  if (centroidCount > 0) {
    meanCx /= centroidCount;
    meanCy /= centroidCount;
    let sqSum = 0;
    for (let t = 0; t < n; t++) {
      const c = centroids[t];
      if (!c) continue;
      const dx = c.x - meanCx;
      const dy = c.y - meanCy;
      sqSum += dx * dx + dy * dy;
    }
    const pathScale = Math.max(minPathScale, Math.sqrt(sqSum / centroidCount));
    for (let t = 0; t < n; t++) {
      const c = centroids[t];
      const pos = new Float32Array(2);
      if (c) {
        pos[0] = clamp((c.x - meanCx) / pathScale, -8, 8);
        pos[1] = clamp((c.y - meanCy) / pathScale, -8, 8);
        trajActive[t] = 1;
      }
      trajPos[t] = pos;
    }
  } else {
    for (let t = 0; t < n; t++) trajPos[t] = new Float32Array(2);
  }

  // 11) 质量检查（用于置信度与分数门控）
  let envSum = 0;
  let fgSum = 0;
  for (let t = 0; t < n; t++) {
    envSum += env[t];
    fgSum += fgRatio[t];
  }
  const envMean = n > 0 ? envSum / n : 0;
  const fgRatioMean = n > 0 ? fgSum / n : 0;
  const lenScore = clamp01((n - 1) / Math.max(2, opts.minFrames - 1));
  const motionScore = clamp01(envMean / 2);
  const contrastScore = clamp01(globalStd / 20);
  const fgScore = clamp01(fgRatioMean / 0.01);
  const usability = clamp01(
    lenScore * (0.1 + 0.45 * motionScore + 0.2 * contrastScore + 0.25 * fgScore),
  );

  return {
    n,
    sourceCount,
    capped,
    sourceSize,
    targetSize: size,
    contour,
    contourNorm,
    motionGrid,
    motionNorm,
    speed,
    velocityDir,
    trajPos,
    trajActive,
    env,
    active: computeActiveFrames(env, opts),
    fgRatio,
    envMean,
    fgRatioMean,
    globalMean,
    globalStd,
    quality: { usability, lenScore, motionScore, contrastScore, fgScore },
  };
}

/**
 * 由运动能量包络计算“有效动作帧”（相对自身最大能量，避免幅度不同导致漏判）。
 * @param {Float32Array} env
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {Uint8Array}
 */
function computeActiveFrames(env, opts) {
  const n = env.length;
  const active = new Uint8Array(n);
  let maxEnv = 0;
  for (let t = 0; t < n; t++) if (env[t] > maxEnv) maxEnv = env[t];
  if (maxEnv < Math.max(0.5, opts.motionNoiseFloor * 0.5)) return active;
  const threshold = Math.max(0.25 * maxEnv, 0.5 * opts.motionNoiseFloor);
  for (let t = 0; t < n; t++) active[t] = env[t] >= threshold ? 1 : 0;
  return active;
}

/**
 * 生成水平镜像后的特征（轮廓列翻转、运动图列翻转、运动方向 x 取反）。
 * 由于轮廓/运动图都是 bbox 归一化的，直接翻转特征与翻转输入等价，且更省时。
 * @param {SequenceFeatures} f
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {SequenceFeatures}
 */
function mirrorFeatures(f, opts) {
  const fw = opts.featureWidth;
  const fh = opts.featureHeight;
  const gs = opts.motionGridSize;
  const contour = new Array(f.n);
  for (let t = 0; t < f.n; t++) {
    const src = f.contour[t];
    const out = new Float32Array(src.length);
    for (let y = 0; y < fh; y++) {
      const row = y * fw;
      for (let x = 0; x < fw; x++) out[row + x] = src[row + (fw - 1 - x)];
    }
    contour[t] = out;
  }
  const motionGrid = new Array(f.n);
  for (let t = 0; t < f.n; t++) {
    const src = f.motionGrid[t];
    const out = new Float32Array(src.length);
    for (let y = 0; y < gs; y++) {
      const row = y * gs;
      for (let x = 0; x < gs; x++) out[row + x] = src[row + (gs - 1 - x)];
    }
    motionGrid[t] = out;
  }
  const velocityDir = new Array(f.n);
  for (let t = 0; t < f.n; t++) {
    const src = f.velocityDir[t];
    velocityDir[t] = new Float32Array([-src[0], src[1]]);
  }
  const trajPos = new Array(f.n);
  for (let t = 0; t < f.n; t++) {
    const src = f.trajPos[t];
    trajPos[t] = new Float32Array([-src[0], src[1]]);
  }
  return {
    ...f,
    contour,
    motionGrid,
    velocityDir,
    trajPos,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 五、逐帧对相似度 与 DTW 对齐
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 计算两条序列中第 i / 第 j 帧的「动作结构相似度」及分项（均为 0..1）。
 * - shape：24×32 轮廓描述子的余弦相似度；双方都无前景记 1，仅一方无前景记 0；
 * - motion：8×8 运动能量图的余弦相似度；双方都静止记 1，仅一方有运动记 0；
 * - velocity：运动方向单位向量点积；双方都低速记 1，仅一方在动记 0；
 * - trajectory：归一化质心轨迹的接近程度（1 - 距离/3，平移与整体尺度无关）。
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @param {number} i
 * @param {number} j
 * @param {typeof DEFAULT_OPTIONS} opts
 * @param {{shape:number,motion:number,velocity:number,trajectory:number}|null} [out] 可选分项输出对象
 * @returns {number} 0..1 的综合逐帧相似度
 */
function pairSimilarity(fa, fb, i, j, opts, out) {
  const aw = opts.actionWeights;

  // 轮廓
  const cA = fa.contour[i];
  const cB = fb.contour[j];
  const nA = fa.contourNorm[i];
  const nB = fb.contourNorm[j];
  let shape;
  if (nA < 1e-6 && nB < 1e-6) {
    shape = 1;
  } else if (nA < 1e-6 || nB < 1e-6) {
    shape = 0;
  } else {
    let dot = 0;
    for (let k = 0; k < cA.length; k++) dot += cA[k] * cB[k];
    shape = clamp01(dot);
  }

  // 运动图
  const mA = fa.motionGrid[i];
  const mB = fb.motionGrid[j];
  const nmA = fa.motionNorm[i];
  const nmB = fb.motionNorm[j];
  let motion;
  if (nmA < 1e-6 && nmB < 1e-6) {
    motion = 1;
  } else if (nmA < 1e-6 || nmB < 1e-6) {
    motion = 0;
  } else {
    let dot = 0;
    for (let k = 0; k < mA.length; k++) dot += mA[k] * mB[k];
    motion = clamp01(dot);
  }

  // 运动方向
  let velocity;
  const spA = fa.speed[i];
  const spB = fb.speed[j];
  const floor = opts.velocityFloor;
  if (spA < floor && spB < floor) {
    velocity = 1;
  } else if (spA < floor || spB < floor) {
    velocity = 0;
  } else {
    const vA = fa.velocityDir[i];
    const vB = fb.velocityDir[j];
    velocity = clamp01(vA[0] * vB[0] + vA[1] * vB[1]);
  }

  // 归一化质心轨迹（平移/尺度不变；只在双方都有前景质心时比较）
  let trajectory;
  const activeA = fa.trajActive[i];
  const activeB = fb.trajActive[j];
  if (!activeA && !activeB) {
    trajectory = 1;
  } else if (!activeA || !activeB) {
    trajectory = 0;
  } else {
    const pA = fa.trajPos[i];
    const pB = fb.trajPos[j];
    const dx = pA[0] - pB[0];
    const dy = pA[1] - pB[1];
    trajectory = clamp01(1 - Math.hypot(dx, dy) / 3);
  }

  if (out) {
    out.shape = shape;
    out.motion = motion;
    out.velocity = velocity;
    out.trajectory = trajectory;
  }
  return clamp01(
    aw.shape * shape +
      aw.motion * motion +
      aw.velocity * velocity +
      aw.trajectory * trajectory,
  );
}

/**
 * 带 Sakoe-Chiba 归一化时间带宽的 DTW。
 *
 * 带宽定义：|i/(n-1) - j/(m-1)| <= bandRatio。使用「归一化时间」而不是原始帧索引，
 * 因此 2 倍时长拉伸这类序列也能落在带内（原始索引带宽会失效）。
 *
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {{
 *   path: Int32Array,
 *   pathLength: number,
 *   meanSim: number,
 *   quantileSim: number,
 *   actionSim: number,
 *   meanShape: number,
 *   meanMotion: number,
 *   meanVelocity: number,
 *   meanTrajectory: number,
 * } | null} 帧数过少等退化情况可能返回 null
 */
function dtwAlign(fa, fb, opts) {
  const n = fa.n;
  const m = fb.n;
  if (n <= 0 || m <= 0) return null;

  // 退化：单帧序列直接比较所有配对，避免除零
  if (n === 1 || m === 1) {
    const pathPairs = [];
    if (n === 1 && m === 1) {
      pathPairs.push([0, 0]);
    } else if (n === 1) {
      for (let j = 0; j < m; j++) pathPairs.push([0, j]);
    } else {
      for (let i = 0; i < n; i++) pathPairs.push([i, 0]);
    }
    return summarizePath(fa, fb, pathPairs, opts);
  }

  const band = opts.bandRatio;
  const invA = 1 / (n - 1);
  const invB = 1 / (m - 1);
  const allowed = (i, j) => Math.abs(i * invA - j * invB) <= band + 1e-12;

  const total = n * m;
  const dp = new Float64Array(total).fill(Infinity);
  const back = new Uint8Array(total).fill(255);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (!allowed(i, j)) continue;
      const cost = 1 - pairSimilarity(fa, fb, i, j, opts);
      const idx = i * m + j;
      if (i === 0 && j === 0) {
        dp[idx] = cost;
        back[idx] = 0;
        continue;
      }
      let best = Infinity;
      let dir = 255;
      // 平局时固定优先级：对角 > 上 > 左，保证确定性
      if (i > 0 && j > 0) {
        const v = dp[(i - 1) * m + (j - 1)];
        if (v < best) {
          best = v;
          dir = 0;
        }
      }
      if (i > 0) {
        const v = dp[(i - 1) * m + j];
        if (v < best) {
          best = v;
          dir = 1;
        }
      }
      if (j > 0) {
        const v = dp[i * m + (j - 1)];
        if (v < best) {
          best = v;
          dir = 2;
        }
      }
      if (Number.isFinite(best)) {
        dp[idx] = cost + best;
        back[idx] = dir;
      }
    }
  }

  const endIdx = (n - 1) * m + (m - 1);
  const pathPairs = [];
  if (!Number.isFinite(dp[endIdx])) {
    // 极端情况（带宽过窄等）退化为线性插值路径，保证不抛异常
    const steps = n + m - 1;
    for (let k = 0; k < steps; k++) {
      const f = steps === 1 ? 0 : k / (steps - 1);
      pathPairs.push([Math.round(f * (n - 1)), Math.round(f * (m - 1))]);
    }
    return summarizePath(fa, fb, pathPairs, opts);
  }

  let ci = n - 1;
  let cj = m - 1;
  pathPairs.push([ci, cj]);
  let guard = 0;
  while ((ci > 0 || cj > 0) && guard < n * m + 4) {
    const dir = back[ci * m + cj];
    if (dir === 0) {
      ci--;
      cj--;
    } else if (dir === 1) {
      ci--;
    } else if (dir === 2) {
      cj--;
    } else {
      break; // 理论上不会发生
    }
    pathPairs.push([ci, cj]);
    guard++;
  }
  pathPairs.reverse();
  return summarizePath(fa, fb, pathPairs, opts);
}

/**
 * 沿给定路径统计平均相似度、低分位相似度与分项均值。
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @param {Array<[number,number]>} pathPairs
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {object|null}
 */
function summarizePath(fa, fb, pathPairs, opts) {
  const len = pathPairs.length;
  if (len === 0) return null;
  const sims = new Float64Array(len);
  const tmp = { shape: 0, motion: 0, velocity: 0, trajectory: 0 };
  let sum = 0;
  let sumShape = 0;
  let sumMotion = 0;
  let sumVelocity = 0;
  let sumTrajectory = 0;
  for (let k = 0; k < len; k++) {
    const pair = pathPairs[k];
    const sim = pairSimilarity(fa, fb, pair[0], pair[1], opts, tmp);
    sims[k] = sim;
    sum += sim;
    sumShape += tmp.shape;
    sumMotion += tmp.motion;
    sumVelocity += tmp.velocity;
    sumTrajectory += tmp.trajectory;
  }
  const meanSim = sum / len;
  const sorted = Array.from(sims).sort((a, b) => a - b);
  const qIndex = Math.min(len - 1, Math.max(0, Math.floor(0.25 * (len - 1))));
  const quantileSim = sorted[qIndex];
  const qw = opts.actionQuantileWeight;
  const actionSim = clamp01((1 - qw) * meanSim + qw * quantileSim);
  const path = new Int32Array(len * 2);
  for (let k = 0; k < len; k++) {
    path[k * 2] = pathPairs[k][0];
    path[k * 2 + 1] = pathPairs[k][1];
  }
  return {
    path,
    pathLength: len,
    meanSim,
    quantileSim,
    actionSim,
    meanShape: sumShape / len,
    meanMotion: sumMotion / len,
    meanVelocity: sumVelocity / len,
    meanTrajectory: sumTrajectory / len,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 六、节奏 / 能量 / 完成度
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 把运动能量包络按归一化时间线性重采样到 outCount 个点（时长不同的序列可比）。
 * @param {Float32Array} env
 * @param {number} outCount
 * @returns {Float32Array}
 */
function resampleEnvelope(env, outCount) {
  const out = new Float32Array(outCount);
  const n = env.length;
  if (n === 0) return out;
  if (n === 1) {
    out.fill(env[0]);
    return out;
  }
  for (let i = 0; i < outCount; i++) {
    const pos = (i / (outCount - 1)) * (n - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = env[i0] * (1 - frac) + env[i1] * frac;
  }
  return out;
}

/**
 * 相对标准差（std / mean），用于判断包络是否近似“恒速”。
 * @param {Float32Array} arr
 * @returns {number}
 */
function relativeStd(arr) {
  const n = arr.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  const mean = sum / n;
  if (Math.abs(mean) < 1e-6) return 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / n) / Math.abs(mean);
}

/**
 * 运动能量包络的时间平滑（移动平均，窗口 3~5 帧，边界收缩）。
 * 节奏相关之前先平滑，可以压掉逐帧噪声对相关性的干扰，同时保留动作的快慢起伏。
 * @param {Float32Array} env
 * @returns {Float32Array}
 */
function smoothEnvelope(env) {
  const n = env.length;
  const out = new Float32Array(n);
  const radius = n >= 40 ? 2 : 1;
  for (let t = 0; t < n; t++) {
    let sum = 0;
    let count = 0;
    for (let d = -radius; d <= radius; d++) {
      const idx = t + d;
      if (idx < 0 || idx >= n) continue;
      sum += env[idx];
      count++;
    }
    out[t] = count > 0 ? sum / count : 0;
  }
  return out;
}

/**
 * 带允许相位偏移的皮尔逊相关（偏移按归一化时间搜索，默认 ±8%）。
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} -1..1
 */
function shiftedPearson(a, b) {
  const len = Math.min(a.length, b.length);
  if (len < 4) return 0;
  const maxShift = Math.max(1, Math.floor(len * 0.08));
  let best = -Infinity;
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    const aStart = shift < 0 ? -shift : 0;
    const bStart = shift > 0 ? shift : 0;
    const overlap = len - Math.abs(shift);
    if (overlap < Math.max(4, Math.floor(len * 0.6))) continue;
    let sa = 0;
    let sb = 0;
    let saa = 0;
    let sbb = 0;
    let sab = 0;
    for (let k = 0; k < overlap; k++) {
      const va = a[aStart + k];
      const vb = b[bStart + k];
      sa += va;
      sb += vb;
      saa += va * va;
      sbb += vb * vb;
      sab += va * vb;
    }
    const ma = sa / overlap;
    const mb = sb / overlap;
    const varA = saa / overlap - ma * ma;
    const varB = sbb / overlap - mb * mb;
    const denom = Math.sqrt(Math.max(0, varA) * Math.max(0, varB));
    const corr = denom < 1e-9 ? 0 : (sab / overlap - ma * mb) / denom;
    if (corr > best) best = corr;
  }
  return Number.isFinite(best) ? clamp(best, -1, 1) : 0;
}

/**
 * 节奏指标：运动能量包络的相关性 + 时长同步。
 *
 * “平坦”判据用相对标准差（std/mean）表示包络起伏大小：
 * - 双方都几乎无起伏（如恒速运动 / 静止）：视作节奏结构相同；
 * - 只有一方有明显起伏、或一方起伏远小于另一方（如对方是匀速直线）：节奏不匹配；
 * - 否则做带允许相位偏移的皮尔逊相关（时间拉伸已在归一化时间重采样里消化）。
 *
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @returns {{metric:number, correlation:number, durationRatio:number, relStdA:number, relStdB:number}}
 */
function computeRhythmMetric(fa, fb) {
  const samples = 64;
  const a = resampleEnvelope(smoothEnvelope(fa.env), samples);
  const b = resampleEnvelope(smoothEnvelope(fb.env), samples);
  const relA = relativeStd(a);
  const relB = relativeStd(b);
  const minRel = Math.min(relA, relB);
  const maxRel = Math.max(relA, relB);
  let correlation;
  if (maxRel < 0.03) {
    // 双方都近似恒速（或无运动）：视作节奏结构相同，避免平坦包络的噪声相关
    correlation = 1;
  } else if (minRel < 0.03 || minRel / maxRel < 0.45) {
    // 一方有明显节拍、另一方近乎平坦（或起伏差距过大）：节奏不匹配
    correlation = 0;
  } else {
    correlation = clamp01(shiftedPearson(a, b));
  }
  const durationRatio = clamp01(Math.min(fa.n, fb.n) / Math.max(fa.n, fb.n));
  const rhythmSim = clamp01(0.75 * correlation + 0.25 * durationRatio);
  return { metric: rhythmSim * 100, correlation, durationRatio, relStdA: relA, relStdB: relB };
}

/**
 * 把归一化质心轨迹按「归一化时间」重采样为固定点数，缺失质心的帧用相邻有效帧线性插值。
 * @param {SequenceFeatures} feat
 * @param {number} samples
 * @returns {Float32Array|null} 长度 samples*2 的 [x0,y0,x1,y1,...]；无任何有效质心时返回 null
 */
function resampleTrajectoryPositions(feat, samples) {
  const n = feat.n;
  const validIdx = [];
  for (let t = 0; t < n; t++) if (feat.trajActive[t]) validIdx.push(t);
  if (validIdx.length === 0) return null;
  const out = new Float32Array(samples * 2);
  if (validIdx.length === 1) {
    const p = feat.trajPos[validIdx[0]];
    for (let i = 0; i < samples; i++) {
      out[i * 2] = p[0];
      out[i * 2 + 1] = p[1];
    }
    return out;
  }
  for (let i = 0; i < samples; i++) {
    const pos = (i / (samples - 1)) * (n - 1);
    let k = 0;
    while (k + 1 < validIdx.length && validIdx[k + 1] <= pos) k++;
    const t0 = validIdx[k];
    const t1 = validIdx[Math.min(validIdx.length - 1, k + 1)];
    const p0 = feat.trajPos[t0];
    const p1 = feat.trajPos[t1];
    const span = t1 - t0;
    const f = span > 0 ? clamp01((pos - t0) / span) : 0;
    out[i * 2] = p0[0] * (1 - f) + p1[0] * f;
    out[i * 2 + 1] = p0[1] * (1 - f) + p1[1] * f;
  }
  return out;
}

/**
 * 归一化时间下的“轨迹形状”相似度（允许 ±12% 的整体相位偏移，应对用户晚起手）。
 *
 * 与 DTW 路径上的逐帧轨迹比较互补：DTW 允许时间弯折，可能把不同轨迹的局部片段
 * 强行对上；这里在等比例时间轴上直接比整体轨迹形状（已去除平移与整体尺度），
 * 可以更稳定地区分「同一个物体走了不同路线」。
 *
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @returns {number} 0..1；任一方没有可用质心轨迹时返回 0
 */
function computeTrajectoryTimingSimilarity(fa, fb) {
  const samples = 64;
  const a = resampleTrajectoryPositions(fa, samples);
  const b = resampleTrajectoryPositions(fb, samples);
  if (!a || !b) return 0;
  const maxShift = Math.round(samples * 0.12);
  const minOverlap = Math.max(8, Math.floor(samples * 0.6));
  let bestSim = 0;
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    const aStart = shift < 0 ? -shift : 0;
    const bStart = shift > 0 ? shift : 0;
    const overlap = samples - Math.abs(shift);
    if (overlap < minOverlap) continue;
    let sum = 0;
    for (let k = 0; k < overlap; k++) {
      const ax = a[(aStart + k) * 2];
      const ay = a[(aStart + k) * 2 + 1];
      const bx = b[(bStart + k) * 2];
      const by = b[(bStart + k) * 2 + 1];
      sum += Math.hypot(ax - bx, ay - by);
    }
    const sim = clamp01(1 - sum / overlap / 3);
    if (sim > bestSim) bestSim = sim;
  }
  return bestSim;
}

/**
 * 轨迹时序相似度 → 动作相似度惩罚系数（1 为不惩罚，1-weight 为最大惩罚）。
 * @param {number} timingSim 0..1
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {number} 0.3..1
 */
function trajectoryTimingFactor(timingSim, opts) {
  const w = opts.trajectoryTimingWeight;
  return clamp01(1 - w * (1 - clamp01(timingSim)));
}

/**
 * 能量指标：两段视频「前景内平均运动强度」的比值（幅度匹配）。
 * 任何一方几乎无运动时返回 0（无动作可比）。
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {{metric:number, ratio:number}}
 */
function computeEnergyMetric(fa, fb, opts) {
  const floor = Math.max(1e-6, opts.motionNoiseFloor);
  const a = fa.envMean;
  const b = fb.envMean;
  if (a < floor || b < floor) return { metric: 0, ratio: 0 };
  const ratio = clamp01(Math.min(a, b) / Math.max(a, b));
  const sim = clamp01(0.3 + 0.7 * ratio);
  return { metric: sim * 100, ratio };
}

/**
 * 完成度指标：沿 DTW 路径的「有效动作状态一致率」(F1) + 时长覆盖率。
 * 用户只做了一部分动作、或中间长时间停顿，F1 会下降。
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @param {Int32Array} path 展开的路径 [i,j,...]
 * @returns {{metric:number, f1:number, durationRatio:number, activeRatioA:number, activeRatioB:number}}
 */
function computeCompletionMetric(fa, fb, path) {
  const len = path.length / 2;
  let demoActivePairs = 0;
  let userActivePairs = 0;
  let bothActive = 0;
  for (let k = 0; k < len; k++) {
    const i = path[k * 2];
    const j = path[k * 2 + 1];
    const da = fa.active[i];
    const du = fb.active[j];
    if (da) demoActivePairs++;
    if (du) userActivePairs++;
    if (da && du) bothActive++;
  }
  let f1 = 0;
  if (demoActivePairs > 0 && userActivePairs > 0) {
    const precision = bothActive / userActivePairs;
    const recall = bothActive / demoActivePairs;
    const denom = precision + recall;
    f1 = denom > 1e-9 ? (2 * precision * recall) / denom : 0;
  }
  const durationRatio = clamp01(Math.min(fa.n, fb.n) / Math.max(fa.n, fb.n));
  const completionSim = f1 > 0 ? clamp01(0.7 * f1 + 0.3 * durationRatio) : 0;
  let activeA = 0;
  let activeB = 0;
  for (let t = 0; t < fa.n; t++) activeA += fa.active[t];
  for (let t = 0; t < fb.n; t++) activeB += fb.active[t];
  return {
    metric: completionSim * 100,
    f1,
    durationRatio,
    activeRatioA: safeDiv(activeA, fa.n, 0),
    activeRatioB: safeDiv(activeB, fb.n, 0),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 七、指标映射 / 质量门控 / 最终结果
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 标准 logistic 函数。
 * @param {number} x
 * @returns {number}
 */
function sigmoid(x) {
  const v = clamp(x, -30, 30);
  return 1 / (1 + Math.exp(-v));
}

/**
 * 动作相似度（0..1）→ action 指标（0..100）。
 * sigmoid 设计目标：完全相同 ≈ 95，明显不同（≤0.5）落在 30 以下。
 * @param {number} sim
 * @param {typeof DEFAULT_OPTIONS} opts
 * @returns {number}
 */
function mapActionMetric(sim, opts) {
  const x = opts.actionSteepness * (sim - opts.actionCenter);
  return clamp01(sigmoid(x)) * 100;
}

/**
 * 序列质量 → 分数门控系数（0.15..1）。
 * 质量很差（太短/几乎无运动/几乎无对比度/前景检不出）时把总分压低，
 * 避免“两张全黑图完全相同”被算成高分。
 * @param {number} usability 0..1
 * @returns {number}
 */
function qualityGate(usability) {
  if (usability >= 0.75) return 1;
  const t = clamp01((usability - 0.2) / 0.55);
  const s = t * t * (3 - 2 * t); // smoothstep
  return 0.15 + 0.85 * s;
}

/**
 * 构造退化结果（空输入等）。
 * @param {SequenceFeatures} fa
 * @param {SequenceFeatures} fb
 * @returns {object}
 */
function degenerateResult(fa, fb) {
  const minQuality = Math.min(fa.quality.usability, fb.quality.usability);
  const confidence = clamp01(0.05 + 0.9 * minQuality);
  return {
    version: ANALYZER_VERSION,
    score: 0,
    metrics: { action: 0, rhythm: 0, energy: 0, completion: 0 },
    confidence: roundTo(confidence, 3),
    debug: {
      version: ANALYZER_VERSION,
      reason: 'empty-input',
      demoFrames: fa.n,
      userFrames: fb.n,
      demoSourceFrames: fa.sourceCount,
      userSourceFrames: fb.sourceCount,
      demoSize: fa.sourceSize,
      userSize: fb.sourceSize,
      framesCapped: fa.capped || fb.capped,
      mirrorInvariant: false,
      mirrored: false,
      qualityDemo: roundTo(fa.quality.usability, 4),
      qualityUser: roundTo(fb.quality.usability, 4),
      qualityGate: 0.15,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 八、公开 API
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 比对「示范动作」与「用户动作」两段逐帧灰度序列，输出奶家人值分数。
 *
 * 输入约定：
 * - demoFrames / userFrames：`Array<{ gray, width, height, t? }>`
 *   - `gray`：长度严格等于 width*height 的灰度数组（Float32Array / Uint8ClampedArray /
 *     普通 number[] 均可），值域 0..255；传入 0..1 浮点会自动按 ×255 处理；
 *   - 尺寸可不为 64×64，内部会按比例最近邻重采样到 64×64；
 *     若 width/height 缺失但与长度能推断出正方形尺寸，也会自动推断；
 *   - 帧序按数组顺序视为等间隔抽帧，最多使用 120 帧（均匀抽样，保留首尾）；
 *   - `t`（可选）当前版本不参与计算，仅为未来支持真实时长保留。
 *
 * 输出（全部 JSON 可序列化）：
 * - `version`：算法版本号（与 ANALYZER_VERSION 一致，方便 Lead 前端展示/排查）；
 * - `score`：0..100，保留 1 位小数；相同动作约 93~99，不同动作约 10~35；
 * - `metrics.action/rhythm/energy/completion`：各 0..100，保留 1 位小数；
 * - `confidence`：0..1，保留 3 位小数；太短 / 无运动 / 全黑 / 空输入会显著降低；
 * - `debug`：小对象，含平均路径相似度、时长比、镜像选择、帧数、质量分等，
 *   便于 Lead 标定分数线；字段全部为 number/string/boolean/数组。
 *
 * 本函数为纯函数：不修改入参，不访问 DOM / window / Node API；相同输入必得相同输出。
 * 注意：这是「动作 / 运动结构比对」，不是专业姿态识别，无法判断动作是否标准；
 * 后续可替换为姿态模型而不改本 API。
 *
 * @param {unknown} demoFrames 示范视频帧数组
 * @param {unknown} userFrames 用户视频帧数组
 * @param {Record<string, unknown>} [options] 覆盖 DEFAULT_OPTIONS 中的任意字段
 * @returns {{version:string, score:number, metrics:{action:number,rhythm:number,energy:number,completion:number}, confidence:number, debug:object}}
 */
export function analyzeSequences(demoFrames, userFrames, options = {}) {
  const opts = resolveOptions(options);
  const demo = buildSequenceFeatures(demoFrames, opts);
  const user = buildSequenceFeatures(userFrames, opts);

  if (demo.n === 0 || user.n === 0) {
    return degenerateResult(demo, user);
  }

  // ── 1) DTW 对齐：正常 + 水平镜像，取「路径相似度 × 轨迹时序惩罚」更优者（镜像容忍） ──
  const normal = dtwAlign(demo, user, opts);
  let best = normal;
  let bestActionSim = 0;
  let bestTimingSim = 0;
  let mirrored = false;
  let normalActionSim = 0;
  let mirroredActionSim = 0;
  if (normal) {
    const normalTimingSim = computeTrajectoryTimingSimilarity(demo, user);
    normalActionSim = clamp01(
      normal.actionSim * trajectoryTimingFactor(normalTimingSim, opts),
    );
    bestActionSim = normalActionSim;
    bestTimingSim = normalTimingSim;
  }
  if (opts.mirrorInvariant) {
    const mirroredFeatures = mirrorFeatures(user, opts);
    const mirror = dtwAlign(demo, mirroredFeatures, opts);
    if (mirror) {
      const mirrorTimingSim = computeTrajectoryTimingSimilarity(demo, mirroredFeatures);
      mirroredActionSim = clamp01(
        mirror.actionSim * trajectoryTimingFactor(mirrorTimingSim, opts),
      );
      if (!best || mirroredActionSim > bestActionSim) {
        best = mirror;
        bestActionSim = mirroredActionSim;
        bestTimingSim = mirrorTimingSim;
        mirrored = true;
      }
    }
  }
  if (!best) {
    return degenerateResult(demo, user);
  }

  const actionMetric = mapActionMetric(bestActionSim, opts);
  const rhythmInfo = computeRhythmMetric(demo, user);
  const energyInfo = computeEnergyMetric(demo, user, opts);
  const completionInfo = computeCompletionMetric(demo, user, best.path);

  const metrics = {
    action: roundTo(clamp(actionMetric, 0, 100), 1),
    rhythm: roundTo(clamp(rhythmInfo.metric, 0, 100), 1),
    energy: roundTo(clamp(energyInfo.metric, 0, 100), 1),
    completion: roundTo(clamp(completionInfo.metric, 0, 100), 1),
  };

  // ── 2) 加权 + 幂次校准 + 质量门控 ──
  const w = opts.weights;
  const weighted01 = clamp01(
    w.action * (metrics.action / 100) +
      w.rhythm * (metrics.rhythm / 100) +
      w.energy * (metrics.energy / 100) +
      w.completion * (metrics.completion / 100),
  );
  const calibrated = 100 * Math.pow(weighted01, opts.scoreGamma);
  const minQuality = Math.min(demo.quality.usability, user.quality.usability);
  const gate = qualityGate(minQuality);
  const score = roundTo(clamp(calibrated * gate, 0, opts.maxScore), 1);
  const confidence = roundTo(clamp01(0.05 + 0.9 * minQuality), 3);

  const debug = {
    version: ANALYZER_VERSION,
    demoFrames: demo.n,
    userFrames: user.n,
    demoSourceFrames: demo.sourceCount,
    userSourceFrames: user.sourceCount,
    demoSize: demo.sourceSize,
    userSize: user.sourceSize,
    framesCapped: demo.capped || user.capped,
    bandRatio: opts.bandRatio,
    pathLength: best.pathLength,
    meanPairSim: roundTo(best.meanSim, 4),
    quantilePairSim: roundTo(best.quantileSim, 4),
    pathActionSim: roundTo(best.actionSim, 4),
    trajectoryTimingSim: roundTo(bestTimingSim, 4),
    actionSim: roundTo(bestActionSim, 4),
    meanShapeSim: roundTo(best.meanShape, 4),
    meanMotionSim: roundTo(best.meanMotion, 4),
    meanVelocitySim: roundTo(best.meanVelocity, 4),
    meanTrajectorySim: roundTo(best.meanTrajectory, 4),
    actionSimNormal: roundTo(normalActionSim, 4),
    actionSimMirrored: roundTo(mirroredActionSim, 4),
    mirrorInvariant: opts.mirrorInvariant,
    mirrored,
    rhythmCorrelation: roundTo(rhythmInfo.correlation, 4),
    rhythmEnvRelStdDemo: roundTo(rhythmInfo.relStdA, 4),
    rhythmEnvRelStdUser: roundTo(rhythmInfo.relStdB, 4),
    durationRatio: roundTo(rhythmInfo.durationRatio, 4),
    energyRatio: roundTo(energyInfo.ratio, 4),
    completionF1: roundTo(completionInfo.f1, 4),
    activeRatioDemo: roundTo(completionInfo.activeRatioA, 4),
    activeRatioUser: roundTo(completionInfo.activeRatioB, 4),
    meanEnergyDemo: roundTo(demo.envMean, 3),
    meanEnergyUser: roundTo(user.envMean, 3),
    fgRatioDemo: roundTo(demo.fgRatioMean, 4),
    fgRatioUser: roundTo(user.fgRatioMean, 4),
    qualityDemo: roundTo(demo.quality.usability, 4),
    qualityUser: roundTo(user.quality.usability, 4),
    qualityGate: roundTo(gate, 4),
    weightedScore: roundTo(weighted01 * 100, 3),
    scoreBeforeGate: roundTo(calibrated, 3),
    score,
  };

  return { version: ANALYZER_VERSION, score, metrics, confidence, debug };
}
