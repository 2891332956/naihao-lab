/** 摄像头只提供内存帧；不使用麦克风、MediaRecorder 或上传接口。 */
import { createFrameReader } from './video-sampler.js'

const abortError = () => new DOMException('已取消', 'AbortError')
const stopStream = stream => stream?.getTracks().forEach(track => track.stop())

/** stop 也使尚未返回的授权请求失效，防止离开页面后迟到的流重新打开镜头。 */
export function createCameraSession(video, { mediaDevices = globalThis.navigator?.mediaDevices } = {}) {
  let version = 0
  let stream = null
  const stop = () => {
    version++
    stopStream(stream)
    stream = null
    video.srcObject = null
  }
  return {
    stop,
    async open() {
      stop()
      const attempt = version
      let received
      try {
        if (!mediaDevices?.getUserMedia) throw new Error('当前环境无法使用摄像头，请用 HTTPS 打开，或选择已有视频。')
        received = await mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
        })
        if (attempt !== version) {
          stopStream(received)
          return false
        }
        stream = received
        video.srcObject = received
        await video.play()
        return attempt === version
      } catch (error) {
        if (attempt !== version) {
          stopStream(received)
          return false
        }
        stop()
        throw error
      }
    },
  }
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: '摄像头权限未开启。请在浏览器地址栏允许摄像头，或选择已有视频。',
    NotFoundError: '没有找到摄像头，可以连接摄像头或选择已有视频。',
    NotReadableError: '摄像头可能被其他应用占用。关闭占用镜头的应用后重试，或选择已有视频。',
    OverconstrainedError: '当前摄像头不支持取景设置，请换个浏览器或选择已有视频。',
    SecurityError: '浏览器限制了摄像头，请在 HTTPS 页面中打开，或选择已有视频。',
  }
  return messages[error?.name] || error?.message || '摄像头暂时无法打开，请重试或选择已有视频。'
}

/** 等间隔采集真实相机帧；掉到后台或长时间卡顿时拒绝不完整结果。 */
export async function sampleLiveVideo(video, { duration = 15, fps = 12, maxFrames = 96, referenceVideo, signal, onProgress } = {}) {
  if (signal?.aborted) throw abortError()
  if (!Number.isFinite(duration) || duration < .4 || duration > 30) throw new Error('跟做时长无效，请重新开始。')
  const readFrame = createFrameReader(video)
  const expected = Math.max(2, Math.min(maxFrames, Math.floor(duration * fps) + 1))
  const margin = Math.min(.05, duration / 10)
  const span = duration - margin * 2
  const frames = []
  return new Promise((resolve, reject) => {
    let raf = 0
    let started = null
    let previousTick = null
    let lastVideoTime = -1
    let lastFreshAt = 0
    let settled = false
    const cleanup = () => {
      cancelAnimationFrame(raf)
      signal?.removeEventListener('abort', onAbort)
    }
    const fail = error => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = () => fail(abortError())
    const tick = now => {
      if (settled) return
      if (signal?.aborted) return onAbort()
      if (started === null) started = now
      const elapsed = (now - started) / 1000
      if (previousTick !== null && now - previousTick > 1000) {
        return fail(new Error('跟做时画面中断了，请保持页面在前台，重新开始。'))
      }
      previousTick = now
      try {
        if (referenceVideo) {
          const finishedReference = referenceVideo.ended && elapsed >= duration - .2
          if (referenceVideo.error ||
              (!finishedReference && (referenceVideo.paused || referenceVideo.ended)) ||
              referenceVideo.playbackRate !== 1 ||
              !Number.isFinite(referenceVideo.currentTime) ||
              Math.abs(referenceVideo.currentTime - elapsed) > 1) {
            throw new Error('示范播放中断或不同步，本次未提交，请重新跟做。')
          }
        }
        const nextAt = margin + span * frames.length / Math.max(1, expected - 1)
        if (frames.length < expected && elapsed >= nextAt && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          frames.push(readFrame(elapsed))
          lastVideoTime = video.currentTime
          lastFreshAt = elapsed
        }
        if (elapsed - lastFreshAt > 1.5) throw new Error('摄像头画面停住了，请检查镜头后重试。')
        onProgress?.({ progress: Math.min(1, elapsed / duration), elapsed, duration, frames: frames.length })
        if (elapsed >= duration) {
          if (frames.length < Math.max(2, expected * .7)) throw new Error('有效画面太少，请保持页面在前台后重试。')
          settled = true
          cleanup()
          resolve({ frames, duration, width: 64, height: 64 })
          return
        }
        raf = requestAnimationFrame(tick)
      } catch (error) { fail(error) }
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    raf = requestAnimationFrame(tick)
  })
}

