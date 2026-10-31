/** 结果页：奶家人值 / 称号揭晓 / 四维成分 / 称号卡下载 */
import { RANKS, metricMetaFor, rankForScore, nextRankFor } from '../config.js'
import { naiwaArtwork } from '../ui/mascot.js'
import {
  icon,
  esc,
  fmtScore,
  formatDate,
  clamp,
  copyText,
  toast,
  prefersReducedMotion,
} from '../ui/dom.js'
import { getCurrentResult, getLeaderboard } from '../store.js'
import { downloadShareCard } from '../ui/share-card.js'
import { burstConfetti } from '../ui/confetti.js'
import { sfx } from '../ui/sfx.js'

function buildTags(metrics, score, pose = false) {
  const tags = []
  if ((metrics.action ?? score) >= 72) tags.push('动作纯正')
  if ((metrics.rhythm ?? score) >= 72) tags.push(pose ? '姿势稳定' : '节奏踩点')
  if ((metrics.energy ?? score) >= 72) tags.push(pose ? '清晰入镜' : '奶量爆发')
  if ((metrics.completion ?? score) >= 72) tags.push('整活完整')
  if ((metrics.action ?? score) < 55) tags.push('动作自由发挥')
  if ((metrics.energy ?? score) < 55) tags.push('奶量含蓄')
  if ((metrics.completion ?? score) < 55) tags.push('收尾随缘')
  if (!tags.length) tags.push('快乐参与')
  return tags.slice(0, 3)
}

function ladderMarkup(score) {
  const ascending = [...RANKS].reverse()
  return `
    <div class="score-ladder">
      <div class="score-ladder-track">
        ${ascending
          .map((rank, i) => {
            const next = ascending[i + 1]
            const end = next ? next.min : 100
            const width = end - rank.min
            return `
          <span class="ladder-seg" style="width:${width}%;--seg:${rank.color}">
            <span>${rank.name}</span>
            <small>${rank.min}+</small>
          </span>`
          })
          .join('')}
        <span class="ladder-marker" style="left:${clamp(score, 0, 100)}%">
          <span class="ladder-marker-label">你 ${fmtScore(score)}</span>
        </span>
      </div>
      <div class="ladder-scale"><span>0</span><span>35</span><span>55</span><span>75</span><span>90</span><span>100</span></div>
    </div>`
}

export const ResultView = {
  async render(main, ctx) {
    document.title = '我的奶量报告 | 奶豪鉴定所'
    const result = getCurrentResult()
    if (!result) {
      main.innerHTML = `
      <section class="page wrap empty-state">
        <p class="empty-emoji">🟡</p>
        <h1>还没有鉴定记录</h1>
        <p class="muted">先让奶蛙看看你有多奶，测完就能领称号卡了。</p>
        <a class="btn btn-primary btn-lg" href="#/naiwa">去测一次奶量</a>
      </section>`
      return
    }

    const rank = RANKS.find((r) => r.id === result.rankId) || rankForScore(result.score)
    const nextRank = nextRankFor(rank.id)
    const score = clamp(Number(result.score) || 0, 0, 100)
    const metrics = result.metrics || {}
    const tags = buildTags(metrics, score, result.analysisMode==='pose')
    const beat = clamp(Math.round(score * 0.92 + 6), 1, 99)
    const diff = nextRank ? Math.max(0, nextRank.min - score) : 0
    const rankIndex = getLeaderboard().findIndex((item) => item.id === result.id)
    const frames = result.frames || { demo: '—', user: '—' }
    const confidence = Number.isFinite(result.confidence) ? Math.round(result.confidence * 100) : null
    const isPreview = result.analyzerVersion === 'preview'
    const reduced = prefersReducedMotion()

    main.innerHTML = `
    <section class="page wrap result-page" style="--rank-color:${rank.color};--rank-soft:${rank.colorSoft}">
      <div class="result-topbar">
        <a class="back-link" href="#/">${icon('arrowLeft', { size: 16 })} 返回首页</a>
        <span class="chip chip-green">${icon('check', { size: 14 })} 鉴定完成</span>
        <span class="result-date">${formatDate(result.createdAt || result.date)}</span>
      </div>

      <div class="result-hero">
        <div class="result-hero-pattern" aria-hidden="true"></div>
        <div class="result-score-block">
          <p class="result-label">你的奶家人值</p>
          ${result.challengeName?`<p class="result-challenge">${esc(result.analysisMode==='pose'?'姿势挑战':'连续动作')} · ${esc(result.challengeName)}</p>`:''}
          <div class="result-score"><span id="score-num">${reduced ? fmtScore(score) : '0.0'}</span><em>分</em></div>
          <p class="result-beat">${rank.min}–${rank.max ?? 100} 分段 · 击败了 <strong>${beat}%</strong> 的奶家人（娱乐算法）</p>
          <div class="result-tag-row">
            ${tags.map((t) => `<span class="tag tag-ink">${t}</span>`).join('')}
          </div>
        </div>

        <div class="result-stamp" id="result-stamp">
          <span class="stamp-icon">${rank.icon}</span>
          <span class="stamp-name">${rank.name}</span>
          <span class="stamp-en">${rank.en}</span>
          <span class="stamp-sub">奶家人认证</span>
        </div>

        <div class="result-naiwa result-rank-art">${naiwaArtwork({ rank, sign: `${Math.round(score)}分` })}</div>
      </div>

      <div class="result-grid">
        <section class="panel rank-detail">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">你的称号</p>
              <h2>${rank.name} <span class="rank-detail-en">${rank.en}</span></h2>
            </div>
            <span class="rank-detail-icon" aria-hidden="true">${rank.icon}</span>
          </div>
          <p class="rank-tagline">「${rank.tagline}」</p>
          <p class="rank-desc">${rank.desc}</p>
          <blockquote class="rank-roast">${rank.roast}</blockquote>
          <div class="rank-next">
            ${
              nextRank
                ? `距离「${nextRank.name}」还差 <strong>${fmtScore(diff)}</strong> 分，再奶一点点。`
                : '你已经是奶界天花板——奶王本王，建议适当收敛奶量。'
            }
          </div>
        </section>

        <section class="panel metrics-panel">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">奶量成分表</p>
              <h2>四维体检</h2>
            </div>
            <span class="chip">${icon('lock', { size: 14 })} 本地比对</span>
          </div>
          <ul class="metric-list">
            ${Object.values(metricMetaFor(result))
              .map((meta) => {
                const value = clamp(Number(metrics[meta.key]) || 0, 0, 100)
                return `
              <li class="metric-item" style="--metric:${meta.color}">
                <div class="metric-row">
                  <span>${meta.label}</span>
                  <strong>${fmtScore(value)}</strong>
                </div>
                <div class="metric-track"><span class="metric-fill" style="--w:${value}%"></span></div>
                <p class="metric-desc">${meta.desc}</p>
              </li>`
              })
              .join('')}
          </ul>
        </section>
      </div>

      <section class="panel ladder-panel">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">奶界地图</p>
            <h2>你在奶家的位置</h2>
          </div>
          <span class="chip">${fmtScore(score)} 分 · ${rank.name}</span>
        </div>
        ${ladderMarkup(score)}
      </section>

      <div class="result-actions">
        <button class="btn btn-primary btn-lg" id="save-card" type="button">
          ${icon('download', { size: 20 })} 保存称号卡
        </button>
        <button class="btn btn-dark btn-lg" id="copy-result" type="button">
          ${icon('copy', { size: 20 })} 复制战绩
        </button>
        <a class="btn btn-ghost btn-lg" href="#/naiwa">${icon('refresh', { size: 18 })} 再测一次</a>
        <a class="btn btn-ghost btn-lg" href="#/rank">看排行榜 ${icon('arrowRight', { size: 18 })}</a>
      </div>

      <div class="result-extra">
        <p>
          ${icon('video', { size: 16 })} ${result.analysisMode==='pose'?`本轮姿势：${esc(result.challengeName)} · ${frames.user} 个采样画面`:`本次比对：示范 ${frames.demo} 帧 × 你的 ${frames.user} 帧`}
          ${confidence !== null ? `· 算法置信度 ${confidence}%` : ''}
          ${rankIndex >= 0 ? `· 本机排名第 ${rankIndex + 1} 名` : ''}
          ${isPreview ? '· 预览数据' : ''}
        </p>
        <p class="fineprint">
          本报告由「奶豪鉴定所」本地动作比对算法生成，纯属娱乐，不是专业测评，不代表你的任何真实能力。
          视频未上传服务器，刷新页面后当前成绩仍会保存在本机排行榜里。
        </p>
      </div>
    </section>`

    // ---------- 分数滚动 + 揭晓动画 ----------
    const timers = []
    const scoreEl = main.querySelector('#score-num')
    const page = main.querySelector('.result-page')
    requestAnimationFrame(() => page?.classList.add('is-ready'))

    function finishReveal() {
      if (!page) return
      page.classList.add('is-revealed')
      if (scoreEl) scoreEl.textContent = fmtScore(score)
    }

    if (reduced) {
      finishReveal()
    } else {
      const started = performance.now()
      const duration = 1150
      const countUp = (now) => {
        const t = Math.min(1, (now - started) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        if (scoreEl) scoreEl.textContent = fmtScore(score * eased)
        if (t < 1) timers.push(requestAnimationFrame(countUp))
        else finishReveal()
      }
      timers.push(requestAnimationFrame(countUp))
      timers.push(
        setTimeout(() => {
          finishReveal()
          burstConfetti({ count: score >= 75 ? 150 : 90 })
          sfx.stamp()
          if (score >= 75) sfx.success()
          else sfx.pop()
        }, 950),
      )
    }

    // ---------- 保存称号卡 ----------
    const saveBtn = main.querySelector('#save-card')
    saveBtn?.addEventListener('click', async () => {
      const original = saveBtn.innerHTML
      saveBtn.disabled = true
      saveBtn.innerHTML = '正在生成称号卡…'
      try {
        await downloadShareCard({ ...result, nickname: result.nickname || '匿名奶家人' })
        toast('称号卡已保存，快去奶家人群里炫耀', { type: 'ok' })
        sfx.pop()
      } catch (err) {
        console.error('[result] 称号卡生成失败', err)
        toast('称号卡生成失败了，换一个浏览器试试', { type: 'error' })
      } finally {
        saveBtn.disabled = false
        saveBtn.innerHTML = original
      }
    })

    // ---------- 复制战绩 ----------
    main.querySelector('#copy-result')?.addEventListener('click', async () => {
      const url = location.origin + location.pathname + location.search
      const text = `我在「奶豪鉴定所」测出了 ${fmtScore(score)} 分，称号是「${rank.name}」！${rank.shareLine}\n你也来测测你的奶家人值 → ${url}`
      const ok = await copyText(text)
      toast(ok ? '战绩已复制，快发给你的奶家人' : '复制失败，请手动截图分享', { type: ok ? 'ok' : 'error' })
      if (ok) sfx.pop()
    })

    return () => {
      timers.forEach((id) => {
        cancelAnimationFrame(id)
        clearTimeout(id)
      })
    }
  },
}
