/**
 * 评分桥接：把「示范视频 + 用户视频」解码成帧，交给 analyzer-core 计算，
 * 再映射成称号与结果对象。
 */
import { analyzeSequences } from './analyzer-core.js'
import { sampleVideo } from './video-sampler.js'
import { NAIWA, rankForScore } from '../config.js'
import { clamp } from '../ui/dom.js'

const { sampleFps, maxDuration } = NAIWA.limits

export const PHASE_TEXT = {
  demo: '正在读取示范动作',
  user: '正在读取你的动作',
  compare: '正在逐帧比对',
  done: '正在生成称号',
}

function newId() {
  return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/**
 * @param {object} params
 * @param {File|Blob|string} params.demoSource
 * @param {File|Blob|string} params.userSource
 * @param {object} [params.demoSequence] 摄像头跟做时已缓存的参考帧
 * @param {object} [params.userSequence] 摄像头在内存中直接采样的帧
 * @param {AbortSignal} [params.signal]
 * @param {(p:{phase:string,ratio:number,detail?:string,frame?:number,frames?:number})=>void} [params.onProgress]
 */
export async function analyzeVideos({ demoSource, userSource, demoSequence, userSequence, signal, onProgress }) {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
  if (!demoSource && !demoSequence) throw new Error('还缺一段示范视频')
  if (!userSource && !userSequence) throw new Error('还缺你的动作，先跟做一遍或选择已有视频')
  const report = (phase, ratio, detail = '') => onProgress?.({ phase, ratio: clamp(ratio, 0, 1), detail })

  report('demo', 0)
  const demo = demoSequence || await sampleVideo(demoSource, {
    fps: sampleFps,
    maxDuration,
    signal,
    onProgress: (p) =>
      report('demo', 0.02 + p.progress * 0.24, `${PHASE_TEXT.demo} · ${p.frame}/${p.frames} 帧`),
  })
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError')

  report('user', 0.28)
  const user = userSequence || await sampleVideo(userSource, {
    fps: sampleFps,
    maxDuration,
    signal,
    onProgress: (p) =>
      report('user', 0.28 + p.progress * 0.34, `${PHASE_TEXT.user} · ${p.frame}/${p.frames} 帧`),
  })
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError')

  report('compare', 0.66, PHASE_TEXT.compare)
  // 等待一帧，让「比对中」文案先渲染出来
  await new Promise((r) => requestAnimationFrame(r))
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
  const raw = analyzeSequences(demo.frames, user.frames)
  report('done', 0.92, PHASE_TEXT.done)
  await new Promise((r) => requestAnimationFrame(r))
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError')

  const result = createAnalysisResult(raw,demo,user)
  onProgress?.({ phase: 'done', ratio: 1, detail: '鉴定完成' })
  return result
}


/** 连续动作与静态姿势共用称号、精度和保存格式。 */
export function createAnalysisResult(raw,demo,user,extra={}) {
  const score = clamp(Number(raw.score) || 0, 0, 100)
  const rank = rankForScore(score)
  return {
    id: newId(),
    module: 'naiwa',
    score: Math.round(score * 10) / 10,
    metrics: raw.metrics,
    confidence: raw.confidence,
    rankId: rank.id,
    debug: raw.debug,
    analyzerVersion: raw.version || null,
    ...(raw.assessment?{assessment:raw.assessment}:{}),
    frames: { demo: demo.frames.length, user: user.frames.length },
    duration: {
      demo: Math.round(demo.duration * 100) / 100,
      user: Math.round(user.duration * 100) / 100,
    },
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

/** 构造一条演示用结果（调试 / 截图 / 未接入素材时的预览） */
export function buildPreviewResult(score = 86.4, { nickname = '测试奶家人' } = {}) {
  const s = clamp(Number(score) || 0, 0, 100)
  const jitter = (seed) => clamp(s + Math.sin(seed) * 9, 0, 100)
  const metrics = {
    action: Math.round(clamp(s + 2, 0, 100) * 10) / 10,
    rhythm: Math.round(jitter(1.3) * 10) / 10,
    energy: Math.round(jitter(2.7) * 10) / 10,
    completion: Math.round(jitter(4.1) * 10) / 10,
  }
  const rank = rankForScore(s)
  return {
    id: 'preview_' + Date.now().toString(36),
    module: 'naiwa',
    score: Math.round(s * 10) / 10,
    metrics,
    confidence: 0.86,
    rankId: rank.id,
    debug: { preview: true },
    analyzerVersion: 'preview',
    frames: { demo: 80, user: 78 },
    duration: { demo: 8.2, user: 7.9 },
    nickname,
    createdAt: new Date().toISOString(),
  }
}
