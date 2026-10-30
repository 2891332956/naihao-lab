/** 调试 / 自动化验收入口：window.__LAB__（仅供开发与截图验证使用） */
import { buildPreviewResult, analyzeVideos } from './analyze/scoring.js'
import { addResult, setCurrentResult, clearResults, getResults } from './store.js'
import { STORAGE_KEYS } from './config.js'

function removeCurrent() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.current)
  } catch {
    /* ignore */
  }
}

function drawFigure(ctx, t, pattern, size) {
  const cx = size / 2
  const baseY = size * 0.66
  ctx.fillStyle = '#F2ECE0'
  ctx.fillRect(0, 0, size, size)
  // 静态地面
  ctx.fillStyle = 'rgba(29,42,32,.16)'
  ctx.fillRect(0, size * 0.82, size, size * 0.18)

  let x = cx
  let y = baseY
  let armAngle = 0
  let armAngle2 = Math.PI
  if (pattern === 'bounce') {
    y = baseY - Math.abs(Math.sin(t * 3.2)) * 42
    armAngle = -0.9
    armAngle2 = Math.PI + 0.9
  } else if (pattern === 'circle') {
    x = cx + Math.cos(t * 2.4) * 58
    y = baseY + Math.sin(t * 2.4) * 26 - 26
    armAngle = Math.cos(t * 2.4) * 0.8
    armAngle2 = Math.PI - Math.cos(t * 2.4) * 0.8
  } else if (pattern === 'waveAlt') {
    y = baseY - Math.abs(Math.sin(t * 2.2 + 0.5)) * 12
    armAngle = -0.6 + Math.sin(t * 2.6 + 0.7) * 0.8
    armAngle2 = Math.PI + 0.5 + Math.sin(t * 2.2) * 0.25
  } else {
    y = baseY - Math.abs(Math.sin(t * 2.2)) * 12
    armAngle = -0.6 + Math.sin(t * 2.6) * 0.95
    armAngle2 = Math.PI - 0.5 - Math.sin(t * 2.2) * 0.25
  }

  ctx.save()
  ctx.translate(x, y)
  // 身体
  ctx.fillStyle = '#2F6B3A'
  ctx.beginPath()
  ctx.ellipse(0, 10, 34, 52, 0, 0, Math.PI * 2)
  ctx.fill()
  // 头
  ctx.beginPath()
  ctx.arc(0, -58, 32, 0, Math.PI * 2)
  ctx.fill()
  // 手臂
  const shoulderY = -24
  const len = 58
  for (const ang of [armAngle, armAngle2]) {
    ctx.save()
    ctx.translate(0, shoulderY)
    ctx.rotate(ang)
    ctx.strokeStyle = '#2F6B3A'
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, len)
    ctx.stroke()
    ctx.restore()
  }
  // 腿
  ctx.strokeStyle = '#2F6B3A'
  ctx.lineWidth = 18
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-14, 54)
  ctx.lineTo(-18, 92)
  ctx.moveTo(14, 54)
  ctx.lineTo(18, 92)
  ctx.stroke()
  ctx.restore()
}

async function recordAnimation(pattern, duration = 2.4) {
  const size = 320
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    throw new Error('当前浏览器不支持 MediaRecorder，无法运行端到端自检')
  }
  const stream = canvas.captureStream(30)
  const candidates = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4']
  const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise((resolve) => {
    rec.onstop = resolve
  })
  const start = performance.now()
  drawFigure(ctx, 0, pattern, size)
  rec.start(120)
  await new Promise((resolve) => {
    const loop = () => {
      const t = (performance.now() - start) / 1000
      drawFigure(ctx, t, pattern, size)
      if (t < duration) requestAnimationFrame(loop)
      else resolve()
    }
    requestAnimationFrame(loop)
  })
  rec.stop()
  await stopped
  stream.getTracks().forEach((t) => t.stop())
  const type = chunks[0]?.type || mimeType || 'video/webm'
  return new Blob(chunks, { type })
}

async function selfTest() {
  const started = performance.now()
  const demoBlob = await recordAnimation('wave')
  // 同一套动作分开录两遍，模拟「用户跟着示范做了一遍」
  const goodBlob = await recordAnimation('wave')
  const badBlob = await recordAnimation('bounce')
  const circleBlob = await recordAnimation('circle')

  const demo = await analyzeVideos({ demoSource: demoBlob, userSource: goodBlob })
  const bad = await analyzeVideos({ demoSource: demoBlob, userSource: badBlob })
  const circle = await analyzeVideos({ demoSource: demoBlob, userSource: circleBlob })

  const pass = demo.score >= 60 && demo.score > bad.score + 10 && demo.score > circle.score + 8
  return {
    ms: Math.round(performance.now() - started),
    scores: { matching: demo.score, different: bad.score, circle: circle.score },
    metrics: { matching: demo.metrics, different: bad.metrics },
    durations: { demo: demo.duration, matching: demo.duration },
    pass,
    pageErrors: (window.__ERRORS__ || []).slice(0, 6),
  }
}

export function installDevTools(router) {
  window.__LAB__ = {
    version: '0.1.0',
    state() {
      return {
        path: router.path,
        hash: location.hash,
        results: getResults().length,
        hasCurrent: Boolean(sessionStorage.getItem(STORAGE_KEYS.current)),
        pageErrors: (window.__ERRORS__ || []).slice(0, 6),
      }
    },
    /** 生成一条演示结果并跳转到结果页：__LAB__.fakeResult(88.6) */
    fakeResult(score = 86.4, opts = {}) {
      const result = buildPreviewResult(score, { nickname: opts.nickname || '测试奶家人' })
      result.nickname = opts.nickname || '测试奶家人'
      setCurrentResult(result)
      if (opts.save !== false) addResult(result)
      location.hash = '#/result'
      return { score: result.score, rankId: result.rankId }
    },
    clear() {
      removeCurrent()
      clearResults()
      location.hash = '#/'
      return true
    },
    selfTest,
    recordAnimation,
  }
}
