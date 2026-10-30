/** WebAudio 音效（无素材依赖，实时合成）；首次交互后才创建 AudioContext */
import { getSettings, setSettings } from '../store.js'

let ctx = null
let enabled = getSettings().sound

export function isSoundOn() {
  return enabled
}

export function setSoundOn(on) {
  enabled = Boolean(on)
  setSettings({ sound: enabled })
  if (enabled) sfx.click()
}

function ensureCtx() {
  if (!enabled) return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

function tone({ freq = 440, dur = 0.08, type = 'sine', gain = 0.04, slide = null, delay = 0 }) {
  const ac = ensureCtx()
  if (!ac) return
  try {
    const t0 = ac.currentTime + delay
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  } catch {
    /* 忽略音频错误 */
  }
}

export const sfx = {
  click() {
    tone({ freq: 560, dur: 0.055, type: 'triangle', gain: 0.035 })
  },
  pop() {
    tone({ freq: 720, dur: 0.09, type: 'sine', gain: 0.045, slide: 980 })
  },
  tick() {
    tone({ freq: 1200, dur: 0.035, type: 'square', gain: 0.012 })
  },
  success() {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, i) => tone({ freq, dur: 0.16, type: 'triangle', gain: 0.04, delay: i * 0.09 }))
  },
  fail() {
    ;[392, 329.63, 261.63].forEach((freq, i) =>
      tone({ freq, dur: 0.16, type: 'sine', gain: 0.035, delay: i * 0.1 }),
    )
  },
  stamp() {
    tone({ freq: 180, dur: 0.18, type: 'sine', gain: 0.07, slide: 90 })
    tone({ freq: 90, dur: 0.2, type: 'triangle', gain: 0.05 })
  },
}
