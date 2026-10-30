/** 轻量 DOM 小工具 + 内联图标 + Toast */

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function el(html) {
  const tpl = document.createElement('template')
  tpl.innerHTML = html.trim()
  return tpl.content.firstElementChild
}

export function qs(selector, root = document) {
  return root.querySelector(selector)
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)]
}

export function fmtScore(score, digits = 1) {
  const v = Number(score)
  return Number.isFinite(v) ? v.toFixed(digits) : '0.0'
}

export function pct(value) {
  return `${Math.max(0, Math.min(100, Math.round(Number(value) || 0)))}%`
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / 1024 / 1024
  return mb >= 10 ? `${mb.toFixed(0)} MB` : `${mb.toFixed(1)} MB`
}

export function formatSeconds(sec) {
  const s = Number(sec)
  if (!Number.isFinite(s) || s <= 0) return '—'
  return `${s.toFixed(1)}s`
}

/** 简单 toast；type: default | ok | warn | error */
export function toast(message, { type = 'default', duration = 2800 } = {}) {
  const root = document.getElementById('toast-root')
  if (!root) return
  const node = el(`<div class="toast toast-${type}" role="status">${esc(message)}</div>`)
  root.appendChild(node)
  requestAnimationFrame(() => node.classList.add('is-show'))
  setTimeout(() => {
    node.classList.remove('is-show')
    setTimeout(() => node.remove(), 260)
  }, duration)
}

/** 安全复制文本 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

const PATHS = {
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  upload: '<path d="M12 16V4m0 0L6 10m6-6 6 6"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M5 20h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  soundOn: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  soundOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4M8 21h8M10 17h4l1 4H9z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  crown: '<path d="M4 18h16M5 18 3 8l5 4 4-7 4 7 5-4-2 10z"/>',
  heart: '<path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 4.5-7 9-7 9z"/>',
}

export function icon(name, { size = 20, className = '' } = {}) {
  const path = PATHS[name] || PATHS.spark
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}

/** 昵称头像：取首字符 */
export function avatarText(name) {
  const n = String(name || '奶').trim()
  return n ? [...n][0] : '奶'
}
