/**
 * 视频抽帧器：把 File / Blob / URL 视频解码成统一规格的灰度帧序列。
 * 输出帧格式（与 analyzer-core.js 的输入约定一致）：
 *   { gray: Float32Array(64*64), width: 64, height: 64, t: number }
 *
 * 设计要点：
 * - 完整画面等比缩放到 64×64，白色留边，避免裁掉手臂；
 * - 固定间隔 seek 抽帧，保证结果可复现；
 * - 全程在浏览器本地完成，视频不会上传。
 */
export const CANON_SIZE = 64

/** 文件与摄像头都保留完整画面，再以相同方式转灰度。 */
export function createFrameReader(video) {
  const canvas = document.createElement('canvas')
  canvas.width = CANON_SIZE
  canvas.height = CANON_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return (t) => {
    const width=video.videoWidth,height=video.videoHeight
    if (!width || !height || video.readyState < 2) throw new Error('摄像头或视频画面尚未就绪，请重试。')
    const scale=CANON_SIZE/Math.max(width,height),w=width*scale,h=height*scale
    ctx.fillStyle='#fff'
    ctx.fillRect(0,0,CANON_SIZE,CANON_SIZE)
    ctx.drawImage(video,0,0,width,height,(CANON_SIZE-w)/2,(CANON_SIZE-h)/2,w,h)
    const rgba = ctx.getImageData(0, 0, CANON_SIZE, CANON_SIZE).data
    const gray = new Float32Array(CANON_SIZE * CANON_SIZE)
    for (let p = 0, j = 0; p < rgba.length; p += 4, j++) {
      gray[j] = rgba[p] * .299 + rgba[p + 1] * .587 + rgba[p + 2] * .114
    }
    return { gray, width: CANON_SIZE, height: CANON_SIZE, t }
  }
}

function waitEvent(target, event, { timeout = 15000, signal } = {}) {
  return new Promise((resolve, reject) => {
    let timer = null
    const clean = () => {
      clearTimeout(timer)
      target.removeEventListener(event, onEvent)
      target.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onEvent = () => {
      clean()
      resolve()
    }
    const onError = () => {
      clean()
      reject(new Error('视频读取失败，请换一个格式试试（推荐 MP4）'))
    }
    const onAbort = () => {
      clean()
      reject(new DOMException('已取消', 'AbortError'))
    }
    if (signal?.aborted) return onAbort()
    timer = setTimeout(() => {
      clean()
      reject(new Error('视频读取超时，请换一个更短的视频试试'))
    }, timeout)
    target.addEventListener(event, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 某些由 MediaRecorder 生成的 WebM 没有写入真实时长（duration = Infinity）。
 * 用「seek 到超大时间再回来」的常见技巧触发浏览器计算真实时长。
 */
async function resolveFiniteDuration(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration
  try {
    const seekTo = async (t) => {
      await new Promise((resolve) => {
        const onSeeked = () => {
          cleanup()
          resolve()
        }
        const timer = setTimeout(() => {
          cleanup()
          resolve()
        }, 1500)
        const cleanup = () => {
          clearTimeout(timer)
          video.removeEventListener('seeked', onSeeked)
        }
        video.addEventListener('seeked', onSeeked, { once: true })
        try {
          video.currentTime = t
        } catch {
          cleanup()
          resolve()
        }
      })
    }
    await seekTo(1e7)
    await seekTo(0)
  } catch {
    /* ignore */
  }
  return video.duration
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.001) {
      resolve()
      return
    }
    let timer = null
    const clean = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    const onSeeked = () => {
      clean()
      resolve()
    }
    const onError = () => {
      clean()
      reject(new Error('视频解码失败，请换一个格式试试（推荐 MP4）'))
    }
    timer = setTimeout(() => {
      clean()
      reject(new Error('视频 seek 超时，请换一个更短的视频试试'))
    }, 8000)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = time
  })
}

/**
 * @param {File|Blob|string} source 本地文件、Blob 或同源视频 URL
 * @param {object} options
 * @param {number} [options.fps=12]     抽帧音调
 * @param {number} [options.maxFrames=96]
 * @param {number} [options.maxDuration=15] 只分析前 N 秒
 * @param {AbortSignal} [options.signal]
 * @param {(p:{progress:number,frame:number,frames:number,duration:number})=>void} [options.onProgress]
 * @returns {Promise<{frames:Array, duration:number, width:number, height:number}>}
 */
export async function sampleVideo(source, options = {}) {
  const { fps = 12, maxFrames = 96, maxDuration = 15, frameReader, signal, onProgress } = options
  if (!source) throw new Error('没有找到视频')

  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
  const src = typeof source === 'string' ? source : objectUrl
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.src = src

  try {
    await waitEvent(video, 'loadedmetadata', { signal, timeout: 12000 })
    if (!video.videoWidth || !video.videoHeight) throw new Error('这个视频好像没有画面，换一个试试')
    if (video.readyState < 2) await waitEvent(video, 'loadeddata', { signal, timeout: 12000 })

    const rawDuration = Number.isFinite(video.duration) ? video.duration : await resolveFiniteDuration(video)
    if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
      throw new Error('读不出这个视频的时长，请换一个 MP4 格式的视频试试')
    }
    const duration = Math.min(Math.max(rawDuration, 0), maxDuration)
    if (!duration || duration < 0.4) throw new Error('视频太短了，至少要 1 秒钟')

    const frameCount = Math.max(2, Math.min(maxFrames, Math.floor(duration * fps) + 1))
    const margin = Math.min(0.05, duration / 10)
    const span = Math.max(0.01, duration - margin * 2)
    const frames = []
    const readFrame = frameReader ? t => frameReader(video,t) : createFrameReader(video)

    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
      const t = margin + (span * i) / Math.max(1, frameCount - 1)
      await seekVideo(video, Math.min(t, Math.max(0, duration - 0.03)))
      frames.push(readFrame(t))
      onProgress?.({
        progress: (i + 1) / frameCount,
        frame: i + 1,
        frames: frameCount,
        duration,
      })
      // 让出主线程，保持进度条顺滑
      if (i % 4 === 3) await new Promise((r) => requestAnimationFrame(r))
    }

    return { frames, duration, width: CANON_SIZE, height: CANON_SIZE }
  } finally {
    video.removeAttribute('src')
    video.load?.()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
