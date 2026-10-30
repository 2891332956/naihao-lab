/** 首页：Hero / 双模块 / 三步流程 / 五档称号 / 榜单预览 / 最终 CTA */
import { MODULES, RANKS, HOW_STEPS, JIAHAO, SITE, rankForScore } from '../config.js'
import { naiwaArtwork, naiwaMarkSVG } from '../ui/mascot.js'
import { icon, esc, fmtScore, avatarText, toast } from '../ui/dom.js'
import { getTopScores, getBestResult, totalCount } from '../store.js'
import { sfx } from '../ui/sfx.js'

function boardRow(entry, index) {
  const rank = rankForScore(entry.score)
  const medal = ['🥇', '🥈', '🥉'][index] || String(index + 1).padStart(2, '0')
  return `
    <li class="board-row ${entry.mine ? 'is-mine' : ''}">
      <span class="board-index">${medal}</span>
      <span class="board-avatar" style="--avatar:${rank.color}">${esc(avatarText(entry.name))}</span>
      <span class="board-name">${esc(entry.name)}${entry.mine ? '<em class="board-me">本机</em>' : ''}</span>
      <span class="board-rank" style="--tile:${rank.colorSoft}">${rank.icon} ${rank.name}</span>
      <span class="board-score">${fmtScore(entry.score)}</span>
    </li>`
}

function moduleCard(m) {
  if (m.status === 'soon') {
    return `
      <article class="module-card module-soon">
        <div class="module-top">
          <span class="module-no">${m.no}</span>
          <span class="chip chip-soon">🔒 打碟中</span>
        </div>
        <span class="module-emoji" aria-hidden="true">${m.emoji}</span>
        <h3>${m.title}</h3>
        <p class="module-metric">测评指标 <strong>${m.metric}</strong></p>
        <p class="module-desc">${m.desc}</p>
        <div class="tag-row">
          ${m.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
        </div>
        <button class="btn btn-ghost btn-block" type="button" data-soon>${m.cta} ${icon('lock', { size: 18 })}</button>
        <p class="module-quote">“${m.quote}”</p>
      </article>`
  }
  return `
    <a class="module-card module-open" href="${m.href}">
      <div class="module-top">
        <span class="module-no">${m.no}</span>
        <span class="chip chip-live"><i class="dot"></i>在线</span>
      </div>
      <span class="module-emoji module-mascot" aria-hidden="true">${naiwaMarkSVG()}</span>
      <h3>${m.title}</h3>
      <p class="module-metric">测评指标 <strong>${m.metric}</strong></p>
      <p class="module-desc">${m.desc}</p>
      <div class="tag-row">
        ${m.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
      <span class="btn btn-dark btn-block">${m.cta} ${icon('arrowRight', { size: 18 })}</span>
    </a>`
}

export const HomeView = {
  async render(main) {
    document.title = '奶豪鉴定所 · 你是几级奶家人？'
    const top = getTopScores(5)
    const best = getBestResult()
    const bestRank = best ? rankForScore(best.score) : null
    const count = totalCount()
    const gaugeWidth = best ? Math.max(8, Math.min(100, best.score)) : 62

    main.innerHTML = `
    <section class="hero wrap">
      <div class="hero-copy">
        <p class="eyebrow sticker-label">2026 全网抽象鉴定企划</p>
        <h1 class="hero-title">
          你是几级<br />
          <span class="hero-hl">奶家人</span><span class="hero-q">？</span>
        </h1>
        <p class="hero-sub">
          黄乎乎的身子，绿眼圈，大肚子——就是你熟悉的那只奶蛙。打开摄像头，跟着做 15 秒，<strong>本地算法</strong>比对动作与节奏，算出你的「奶家人值」，
          赐你一个奶家称号：奶王、奶后、奶家人、奶狗、奶使。
        </p>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg" href="#/naiwa">开始测奶 ${icon('arrowRight', { size: 20 })}</a>
          <a class="btn btn-ghost btn-lg" href="#/about">先看鉴定说明</a>
        </div>
        <ul class="hero-chips">
          <li class="chip">${icon('lock', { size: 16 })} 视频不出本机</li>
          <li class="chip">⏱️ 约 10 秒出分</li>
          <li class="chip">👑 五档称号</li>
        </ul>
        <p class="hero-count">已有 <strong>${count.toLocaleString()}</strong> 位奶家人完成鉴定</p>
      </div>

      <div class="hero-stage">
        <div class="stage-card">
          <div class="stage-top">
            <span class="stage-stamp">奶量检测中</span>
            <span class="stage-no">NO.114514</span>
          </div>
          <div class="stage-bubble">让我看看<br />你有多奶</div>
          <div class="hero-naiwa-wrap" id="hero-naiwa" role="button" tabindex="0" aria-label="戳一下奶蛙">
            ${naiwaArtwork({ className: 'hero-naiwa', sign: best ? `最高${Math.round(best.score)}` : '奶量?' })}
          </div>
          <div class="stage-gauge">
            <div class="gauge-head">
              <span>本机最高奶量</span>
              <strong>${best ? fmtScore(best.score) + ' 分' : '等待首测'}</strong>
            </div>
            <div class="gauge-track">
              <span style="width:${gaugeWidth}%"></span>
              <i class="gauge-naiwa" style="left:${gaugeWidth}%">🟡</i>
            </div>
            <div class="gauge-ranks">
              ${RANKS.map((r) => `<span style="--c:${r.color}">${r.name}</span>`).join('')}
            </div>
          </div>
        </div>
        <span class="sticker sticker-a">MILK CHECK</span>
        <span class="sticker sticker-b">🟡 奶家人认证</span>
        <span class="sticker sticker-c">${best ? `${bestRank.icon} ${bestRank.name}` : '等你来测'}</span>
      </div>
    </section>

    <section class="section wrap" id="modules">
      <div class="section-head">
        <p class="eyebrow">双厨狂喜</p>
        <h2 class="section-title">两台检测舱<br class="br-mobile" />已开机一台</h2>
        <p class="section-sub">奶蛙舱已开放，嘉豪舱正在隔壁班打碟调试中。</p>
      </div>
      <div class="module-grid">
        ${MODULES.map(moduleCard).join('')}
      </div>
    </section>

    <section class="section wrap">
      <div class="section-head">
        <p class="eyebrow">HOW IT WORKS</p>
        <h2 class="section-title">三步测出你的奶量</h2>
        <p class="section-sub">不用注册，不用下载，手机就能测。</p>
      </div>
      <div class="steps-grid">
        ${HOW_STEPS.map(
          (step) => `
          <article class="step-card">
            <span class="step-no">${step.no}</span>
            <span class="step-icon" aria-hidden="true">${step.icon}</span>
            <h3>${step.title}</h3>
            <p>${step.desc}</p>
          </article>`,
        ).join('')}
      </div>
    </section>

    <section class="section wrap" id="ranks">
      <div class="section-head">
        <p class="eyebrow">MILK LEVELS</p>
        <h2 class="section-title">五档称号，你在第几层？</h2>
        <p class="section-sub">从奶使到奶王，每一层都有它的奶味。</p>
      </div>
      <div class="rank-grid">
        ${RANKS.map(
          (rank, index) => `
          <a class="rank-tile" href="#/naiwa" style="--tile:${rank.color};--tile-soft:${rank.colorSoft}" aria-label="开始测奶，争取${rank.name}称号">
            <span class="rank-portrait">
              <img src="${esc(rank.image)}" alt="${esc(rank.imageAlt)}" width="280" height="280" loading="lazy" decoding="async">
              <span class="rank-card-level" aria-hidden="true">LEVEL 0${RANKS.length - index}</span>
            </span>
            <div class="rank-card-heading">
            <h3>${rank.name}</h3>
            <p class="rank-range">${rank.min}–${rank.max ?? 100} 分</p>
            </div>
            <p class="rank-en">${rank.en}</p>
            <p class="rank-tagline">${rank.tagline}</p>
            <span class="rank-go">试试你的奶量 ${icon('arrowRight', { size: 16 })}</span>
          </a>`,
        ).join('')}
      </div>
      <p class="rank-note">${icon('spark', { size: 18 })} 分数越高奶量越足；测不到奶王也没关系，奶使也能快乐起飞。</p>
    </section>

    <section class="section wrap">
      <div class="board-card">
        <div class="board-head">
          <div>
            <p class="eyebrow">MILK RANKING</p>
            <h2>奶量风云榜 · TOP 5</h2>
          </div>
          <a class="btn btn-ghost btn-sm" href="#/rank">看完整榜单 ${icon('arrowRight', { size: 16 })}</a>
        </div>
        <ol class="board-list">
          ${top.map((entry, i) => boardRow(entry, i)).join('')}
        </ol>
        <p class="board-foot">
          ${best ? `你本机的最佳成绩：<strong>${fmtScore(best.score)} 分 · ${bestRank.name}</strong>，快去冲榜！` : '榜单前几名是奶家人友情出演，等你来把他们挤下去。'}
        </p>
      </div>
    </section>

    <section class="section wrap">
      <div class="final-cta">
        <div class="final-copy">
          <p class="eyebrow eyebrow-light">READY TO MILK?</p>
          <h2>别想了，<br />你肯定也是奶家人</h2>
          <p>10 秒不到就能出分。视频只在你的浏览器里处理，测完还能领一张专属称号卡。</p>
          <a class="btn btn-primary btn-lg" href="#/naiwa">现在开始测奶 ${icon('arrowRight', { size: 20 })}</a>
          <p class="final-privacy">${icon('lock', { size: 16 })} 无注册 · 无上传 · 纯娱乐</p>
        </div>
        <div class="final-naiwa">${naiwaArtwork({ mood: 'judge', sign: '奶量警告' })}</div>
      </div>
    </section>
    `

    // 嘉豪模块：即将上线 toast
    main.querySelectorAll('[data-soon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.pop()
        toast(`嘉豪还在隔壁班打碟，${JIAHAO.metric}检测很快就来。`, { duration: 3200 })
      })
    })

    // 戳奶蛙彩蛋
    const naiwaWrap = main.querySelector('#hero-naiwa')
    const lines = [
      '别戳了，奶会漏的。',
      '你这一戳，奶量 +1。',
      '奶蛙说：先看示范，再测奶量。',
      '再戳就要喊奶家人来评理了。',
    ]
    let taps = 0
    const tap = () => {
      taps += 1
      sfx.pop()
      toast(lines[taps % lines.length], { duration: 1800 })
    }
    naiwaWrap?.addEventListener('click', tap)
    naiwaWrap?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        tap()
      }
    })

    return () => {}
  },
}
