/** 彩带/纸屑庆祝动画（结果页用），尊重 prefers-reduced-motion */
import { prefersReducedMotion } from './dom.js'

const DEFAULT_COLORS = ['#FFD35C', '#FF9CB8', '#87D96B', '#8ED0FF', '#FFFDF6', '#1D2A20']

export function burstConfetti({ colors = DEFAULT_COLORS, count = 130, duration = 2600 } = {}) {
  if (prefersReducedMotion()) return
  const canvas = document.createElement('canvas')
  canvas.className = 'confetti-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const W = window.innerWidth
  const H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  ctx.scale(dpr, dpr)

  const particles = Array.from({ length: count }, () => {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.35
    const speed = 6 + Math.random() * 11
    return {
      x: W * (0.5 + (Math.random() - 0.5) * 0.2),
      y: H * (0.32 + Math.random() * 0.08),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() > 0.7,
      drag: 0.985 + Math.random() * 0.008,
    }
  })

  const start = performance.now()
  let raf = 0
  function frame(now) {
    const elapsed = now - start
    ctx.clearRect(0, 0, W, H)
    for (const p of particles) {
      p.vy += 0.22
      p.vx *= p.drag
      p.vy *= 0.995
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      const alpha = Math.max(0, 1 - Math.max(0, elapsed - duration * 0.55) / (duration * 0.45))
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.round) {
        ctx.beginPath()
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      }
      ctx.restore()
    }
    if (elapsed < duration) {
      raf = requestAnimationFrame(frame)
    } else {
      cancelAnimationFrame(raf)
      canvas.remove()
    }
  }
  raf = requestAnimationFrame(frame)
}
