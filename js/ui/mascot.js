/** 奶蛙形象统一入口：使用 material 中的黄色二创形象与动作参考图。 */
import { NAIWA } from '../config.js'
import { esc } from './dom.js'

export function naiwaImage(mood = 'happy') {
  return NAIWA.references.find((ref) => ref.id === NAIWA.visuals[mood]) || NAIWA.references[0]
}

export function naiwaArtwork({ mood = 'happy', rank = null, sign = null, className = '' } = {}) {
  const reference = rank ? { src: rank.image, alt: rank.imageAlt } : naiwaImage(mood)
  return `<span class="naiwa-art ${esc(className)}" data-character="yellow-naiwa">
    <img src="${esc(reference.src)}" alt="${esc(reference.alt)}" width="320" height="350" decoding="async" />
    ${sign ? `<span class="naiwa-sign">${esc(String(sign).slice(0, 12))}</span>` : ''}
  </span>`
}

/** 小图标保留黄色梨形轮廓、浅色肚子与绿色眼圈，适用于页头和导航。 */
export function naiwaMarkSVG({ className = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="naiwa-mark ${esc(className)}" viewBox="0 0 96 96" aria-hidden="true">
    <path d="M48 8 C64 8 68 22 72 36 C78 49 86 61 83 75 C80 88 64 91 48 91 C30 91 14 87 13 74 C12 61 21 48 25 34 C29 18 33 8 48 8Z" fill="#EBC754" stroke="#343326" stroke-width="4"/>
    <ellipse cx="48" cy="68" rx="23" ry="18" fill="#F4E5B4"/>
    <ellipse cx="36" cy="31" rx="9" ry="10" fill="#A7BE7A"/>
    <ellipse cx="61" cy="31" rx="9" ry="10" fill="#A7BE7A"/>
    <circle cx="37" cy="32" r="5" fill="#171D15"/><circle cx="62" cy="32" r="5" fill="#171D15"/>
    <path d="M39 47 Q48 50 58 47" fill="none" stroke="#575031" stroke-width="3" stroke-linecap="round"/>
    <path d="M21 60 L32 69 M75 60 L64 69" stroke="#68613C" stroke-width="9" stroke-linecap="round"/>
  </svg>`
}
