/**
 * 称号卡生成：把结果画到 1080×1440 的 Canvas 上，供用户下载分享。
 * Canvas 2D + 本地奶蛙参考图，与站内主形象使用同一组素材。
 */
import { RANKS, SITE, rankForScore, metricMetaFor } from '../config.js'
import { fmtScore, formatDate, clamp } from './dom.js'

const INK = '#1D2A20'
const PAPER = '#FFFDF6'
const FONT = `'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif`
const W = 1080
const H = 1440

function font(weight, size) {
  return `${weight} ${size}px ${FONT}`
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function textCenter(ctx, text, x, y, { weight = 700, size = 32, color = INK, maxWidth } = {}) {
  ctx.font = font(weight, size)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (maxWidth) ctx.fillText(text, x, y, maxWidth)
  else ctx.fillText(text, x, y)
}

function loadRankImage(rank) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('奶蛙参考图加载失败，请刷新后重试'))
    img.src = rank.image
  })
}

function drawDots(ctx, color) {
  ctx.save()
  ctx.fillStyle = color
  for (let y = 60; y < H; y += 52) {
    for (let x = 60; x < W; x += 52) {
      ctx.beginPath()
      ctx.arc(x, y, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawMetricBar(ctx, x, y, width, label, value, color) {
  const v = clamp(Number(value) || 0, 0, 100)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = font(700, 30)
  ctx.fillStyle = INK
  ctx.fillText(label, x, y)
  ctx.textAlign = 'right'
  ctx.font = font(900, 30)
  ctx.fillText(v.toFixed(1), x + width, y)

  const barY = y + 26
  roundRect(ctx, x, barY, width, 20, 10)
  ctx.fillStyle = 'rgba(29,42,32,.12)'
  ctx.fill()
  roundRect(ctx, x, barY, Math.max(14, (width * v) / 100), 20, 10)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.stroke()
}

/**
 * @param {object} result 结果对象
 * @param {object} [opts]
 * @param {boolean} [opts.returnDataUrl] 是否返回 dataURL（默认为 canvas）
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderShareCard(result, opts = {}) {
  const rank = RANKS.find((r) => r.id === result.rankId) || rankForScore(result.score || 0)
  const score = clamp(Number(result.score) || 0, 0, 100)
  const metrics = result.metrics || { action: score, rhythm: score, energy: score, completion: score }
  const nickname = result.nickname || result.name || '匿名奶家人'
  const date = result.createdAt || result.date || new Date().toISOString()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // 背景
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, rank.colorSoft)
  bg.addColorStop(0.55, '#FFF7E9')
  bg.addColorStop(1, rank.color)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  drawDots(ctx, 'rgba(29,42,32,.10)')

  // 装饰圆
  ctx.fillStyle = 'rgba(255,255,255,.35)'
  ctx.beginPath()
  ctx.arc(905, 205, 190, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(29,42,32,.06)'
  ctx.beginPath()
  ctx.arc(120, 1330, 220, 0, Math.PI * 2)
  ctx.fill()

  // 外框
  ctx.strokeStyle = INK
  ctx.lineWidth = 10
  roundRect(ctx, 36, 36, W - 72, H - 72, 44)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(29,42,32,.25)'
  ctx.lineWidth = 3
  roundRect(ctx, 58, 58, W - 116, H - 116, 32)
  ctx.stroke()

  // 页头
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = INK
  ctx.font = font(900, 42)
  ctx.fillText(SITE.name, 88, 120)
  ctx.font = font(700, 20)
  ctx.fillStyle = 'rgba(29,42,32,.65)'
  ctx.fillText(result.challengeName ? (result.analysisMode==='pose'?'姿势挑战 · ':'连续动作 · ')+result.challengeName : SITE.en+' · 奶蛙奶量鉴定', 90, 158, 600)
  ctx.textAlign = 'right'
  ctx.font = font(700, 22)
  ctx.fillText('检测报告 / REPORT', W - 92, 122)
  ctx.font = font(500, 20)
  ctx.fillStyle = 'rgba(29,42,32,.6)'
  const reportNo = 114514 + Math.round(score * 13)
  ctx.fillText(`NO. ${reportNo}`, W - 92, 158)

  // 称号贴纸
  ctx.save()
  ctx.translate(W / 2, 300)
  ctx.rotate(-0.035)
  roundRect(ctx, -260, -84, 520, 168, 30)
  ctx.fillStyle = rank.color
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 8
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(900, 112)
  ctx.fillStyle = INK
  ctx.fillText(rank.name, 0, -6)
  ctx.font = font(700, 24)
  ctx.fillText(rank.en, 0, 62)
  ctx.restore()

  // 对应称号形象；完整等比放进相框，横图与竖图都不拉伸。
  const img = await loadRankImage(rank)
  const imageScale = Math.min(286 / img.naturalWidth, 242 / img.naturalHeight)
  const imageWidth = img.naturalWidth * imageScale
  const imageHeight = img.naturalHeight * imageScale
  ctx.save()
  ctx.translate(W - 258, 446)
  ctx.rotate(0.04)
  roundRect(ctx, -158, -40, 316, 270, 20)
  ctx.fillStyle = PAPER
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.drawImage(img, -imageWidth / 2, -26 + (242 - imageHeight) / 2, imageWidth, imageHeight)
  ctx.restore()

  // 分数
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const scoreText = fmtScore(score)
  ctx.fillStyle = INK
  ctx.font = font(900, 188)
  ctx.fillText(scoreText, 88, 590)
  const scoreWidth = ctx.measureText(scoreText).width
  ctx.font = font(900, 54)
  ctx.fillText('分', 88 + scoreWidth + 16, 586)
  ctx.font = font(700, 30)
  ctx.fillStyle = 'rgba(29,42,32,.7)'
  ctx.fillText('奶家人值 / MILK FAMILY VALUE', 90, 650)

  // 一句话
  ctx.font = font(800, 38)
  ctx.fillStyle = INK
  ctx.fillText(`「${rank.tagline}」`, 90, 738, W - 180)

  // 四维成分表
  const panelX = 80
  const panelY = 790
  const panelW = W - 160
  const panelH = 336
  roundRect(ctx, panelX, panelY, panelW, panelH, 28)
  ctx.fillStyle = PAPER
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 5
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = INK
  ctx.font = font(900, 26)
  ctx.fillText('奶量成分表', panelX + 34, panelY + 42)
  ctx.font = font(500, 20)
  ctx.fillStyle = 'rgba(29,42,32,.55)'
  ctx.fillText('LOCAL MOTION ANALYSIS', panelX + 34, panelY + 74)
  const metricRows = Object.values(metricMetaFor(result)).map(meta=>[meta.label,metrics[meta.key]??score,meta.color])
  metricRows.forEach(([label, value, color], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = panelX + 36 + col * ((panelW - 72) / 2 + 12)
    const y = panelY + 118 + row * 100
    drawMetricBar(ctx, x, y, (panelW - 72) / 2 - 12, label, value, color)
  })

  // 底部信息条
  roundRect(ctx, 80, 1166, W - 160, 96, 22)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#FFF7E9'
  ctx.font = font(800, 30)
  ctx.fillText(`${nickname}`, 112, 1214)
  ctx.font = font(500, 20)
  ctx.fillStyle = 'rgba(255,247,233,.7)'
  ctx.fillText(`${formatDate(date)} · ${SITE.name} 第 ${reportNo} 号报告`, 112, 1244)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#FFD35C'
  ctx.font = font(900, 28)
  ctx.fillText('你也来测测奶量 →', W - 112, 1218)

  // 免责声明
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(29,42,32,.62)'
  ctx.font = font(500, 22)
  ctx.fillText('本测评为网络热梗同人趣味企划 · 纯属娱乐 · 视频全程本地处理', W / 2, 1320)
  ctx.fillStyle = 'rgba(29,42,32,.4)'
  ctx.font = font(500, 18)
  ctx.fillText(`© ${SITE.year} ${SITE.name} · ${SITE.tagline}`, W / 2, 1356)

  return canvas
}

/** 生成并下载称号卡 PNG */
export async function downloadShareCard(result) {
  const canvas = await renderShareCard(result)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('称号卡生成失败')
  const url = URL.createObjectURL(blob)
  const rank = RANKS.find((r) => r.id === result.rankId) || rankForScore(result.score || 0)
  const a = document.createElement('a')
  a.href = url
  a.download = `奶豪鉴定所_${rank.name}_${fmtScore(result.score)}分.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
