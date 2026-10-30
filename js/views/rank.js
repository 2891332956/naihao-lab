/** 排行榜：本期奶量风云榜（本机成绩 + 种子数据） */
import { JIAHAO, rankForScore } from '../config.js'
import { naiwaArtwork } from '../ui/mascot.js'
import { icon, esc, fmtScore, avatarText, formatDate, toast } from '../ui/dom.js'
import { getLeaderboard, getResults, getBestResult } from '../store.js'
import { sfx } from '../ui/sfx.js'

function podiumCard(entry, place) {
  if (!entry) return '<div class="podium-card podium-empty" aria-hidden="true"></div>'
  const rank = rankForScore(entry.score)
  return `
    <article class="podium-card place-${place} ${entry.mine ? 'is-mine' : ''}" style="--tile:${rank.color};--tile-soft:${rank.colorSoft}">
      <span class="podium-medal">${place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</span>
      <span class="podium-avatar" style="--avatar:${rank.color}">${esc(avatarText(entry.name))}</span>
      <h3>${esc(entry.name)}${entry.mine ? '<em class="board-me">本机</em>' : ''}</h3>
      <span class="podium-rank">${rank.icon} ${rank.name}</span>
      <span class="podium-score">${fmtScore(entry.score)}</span>
      <span class="podium-date">${esc(entry.date)}</span>
    </article>`
}

function tableRow(entry, index) {
  const rank = rankForScore(entry.score)
  return `
    <li class="rank-row ${entry.mine ? 'is-mine' : ''}" style="--tile:${rank.colorSoft}">
      <span class="rank-row-no">${String(index).padStart(2, '0')}</span>
      <span class="rank-row-name">${esc(entry.name)}${entry.mine ? '<em class="board-me">本机</em>' : ''}</span>
      <span class="rank-row-title">${rank.icon} ${rank.name}</span>
      <span class="rank-row-date">${esc(entry.date)}</span>
      <span class="rank-row-score">${fmtScore(entry.score)}</span>
    </li>`
}

export const RankView = {
  async render(main) {
    document.title = '奶量风云榜 | 奶豪鉴定所'
    const board = getLeaderboard()
    const best = getBestResult()
    const bestRank = best ? rankForScore(best.score) : null
    const top3 = board.slice(0, 3)
    const rest = board.slice(3)

    main.innerHTML = `
    <section class="page wrap rank-page">
      <div class="rank-head">
        <div>
          <p class="eyebrow">MILK RANKING</p>
          <h1>奶量风云榜</h1>
          <p class="page-sub">全站奶家人的奶量排位。前几名由奶家人友情出演，等你来把他们挤下去。</p>
        </div>
        <div class="rank-head-naiwa" aria-hidden="true">${naiwaArtwork({ mood: 'judge' })}</div>
      </div>

      <div class="rank-tabs" role="tablist" aria-label="榜单切换">
        <button class="rank-tab is-active" type="button" role="tab" aria-selected="true">🟡 奶蛙榜</button>
        <button class="rank-tab is-locked" type="button" role="tab" aria-selected="false" data-soon>
          🕶️ 嘉豪榜 ${icon('lock', { size: 14 })}
        </button>
      </div>

      <div class="podium">
        ${podiumCard(top3[1], 2)}
        ${podiumCard(top3[0], 1)}
        ${podiumCard(top3[2], 3)}
      </div>

      <div class="panel board-table">
        <div class="board-table-head">
          <span>名次</span><span>奶家人</span><span>称号</span><span>日期</span><span>奶家人值</span>
        </div>
        <ol class="rank-list">
          ${rest.map((entry, i) => tableRow(entry, i + 4)).join('')}
        </ol>
      </div>

      <div class="rank-cta">
        <div>
          ${
            best
              ? `<p class="eyebrow">MY BEST</p>
                 <h2>你本机最佳：${fmtScore(best.score)} 分 · ${bestRank.name}</h2>
                 <p class="muted">共测过 ${getResults().length} 次，取最后一次上本机榜。再奶一点，冲进前三。</p>`
              : `<p class="eyebrow">YOU'RE NEXT</p>
                 <h2>榜单还缺一个你</h2>
                 <p class="muted">测一次就能上榜，成绩只保存在你自己的浏览器里。</p>`
          }
        </div>
        <a class="btn btn-primary btn-lg" href="#/naiwa">去测我的奶量 ${icon('arrowRight', { size: 20 })}</a>
      </div>

      <p class="rank-note">
        ${icon('lock', { size: 16 })}
        演示版榜单：种子数据用于营造氛围，真实成绩仅保存在本机浏览器（localStorage），不会上传服务器。清空浏览器数据后会消失。
      </p>
    </section>`

    main.querySelector('[data-soon]')?.addEventListener('click', () => {
      sfx.pop()
      toast(`嘉豪榜正在打碟调试中，先测奶蛙榜吧。${JIAHAO.quote}`, { duration: 3200 })
    })

    return () => {}
  },
}
