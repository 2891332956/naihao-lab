/** 应用外壳：页头 / 滚动弹幕 / 路由出口 / 页脚 / 移动端底部导航 */
import { createRouter } from './router.js'
import { SITE, NAV, TICKER, JIAHAO } from './config.js'
import { naiwaMarkSVG } from './ui/mascot.js'
import { icon, toast } from './ui/dom.js'
import { isSoundOn, setSoundOn, sfx } from './ui/sfx.js'
import { totalCount } from './store.js'
import { HomeView } from './views/home.js'
import { NaiwaView } from './views/naiwa.js'
import { ResultView } from './views/result.js'
import { RankView } from './views/rank.js'
import { AboutView } from './views/about.js'
import { DebugView } from './views/debug.js'
import { installDevTools } from './dev.js'

const app = document.getElementById('app')

const tickerItems = [...TICKER, ...TICKER]
  .map((text) => `<span class="ticker-item">${text}<i>🟡</i></span>`)
  .join('')

app.innerHTML = `
  <a class="skip-link" href="#view">跳到主要内容</a>
  <header class="site-header">
    <div class="header-inner wrap">
      <a class="brand" href="#/" aria-label="${SITE.name}首页">
        ${naiwaMarkSVG({ className: 'brand-naiwa' })}
        <span class="brand-text">
          <strong>${SITE.name}</strong>
          <small>${SITE.en}</small>
        </span>
      </a>
      <nav class="main-nav" aria-label="主导航">
        ${NAV.map((item) => `<a href="${item.href}" data-nav="${item.href}">${item.label}</a>`).join('')}
      </nav>
      <div class="header-actions">
        <button class="icon-btn" id="sound-toggle" type="button" aria-label="开关音效" aria-pressed="false">
          ${icon('soundOn', { size: 20 })}
        </button>
        <a class="btn btn-dark btn-sm header-cta" href="#/naiwa">开始测奶</a>
      </div>
    </div>
  </header>

  <div class="ticker" aria-hidden="true">
    <div class="ticker-track">${tickerItems}</div>
  </div>

  <main id="view" tabindex="-1"></main>

  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div class="footer-brand">
        <a class="brand brand-footer" href="#/">
          ${naiwaMarkSVG({ className: 'brand-naiwa' })}
          <span class="brand-text"><strong>${SITE.name}</strong><small>${SITE.en}</small></span>
        </a>
        <p class="footer-tagline">${SITE.tagline}</p>
        <p class="footer-privacy">${icon('lock', { size: 16 })} 视频全程本地处理，不上传服务器</p>
      </div>
      <div class="footer-col">
        <h3>检测舱</h3>
        <a href="#/naiwa">奶蛙 · 奶量鉴定</a>
        <span class="footer-soon">嘉豪 · 豪意鉴定（打碟中）</span>
        <a href="#/rank">奶量风云榜</a>
      </div>
      <div class="footer-col">
        <h3>关于</h3>
        <a href="#/about">鉴定说明</a>
        <a href="#/about#faq">常见问题</a>
        <a href="#/debug">调试台</a>
      </div>
      <div class="footer-col footer-legal">
        <h3>免责声明</h3>
        <p>本站是网络热梗同人趣味企划，与任何品牌、艺人、学校无关。测评为娱乐向动作比对，分数不代表任何真实能力，请勿当真。</p>
        <p class="footer-memes">奶蛙 / 嘉豪 梗源自互联网，感谢每一位奶家人。</p>
      </div>
    </div>
    <div class="wrap footer-bottom">
      <span>© ${SITE.year} ${SITE.name} · 用奶发电</span>
      <span>已鉴定 ${totalCount().toLocaleString()} 位奶家人</span>
      <span>${JIAHAO.quote}</span>
    </div>
  </footer>

  <nav class="mobile-tabbar" aria-label="底部导航">
    <a href="#/" data-nav="#/" data-tab="home"><span>🟡</span>首页</a>
    <a href="#/naiwa" data-nav="#/naiwa" data-tab="naiwa"><span>🎬</span>鉴定</a>
    <a href="#/rank" data-nav="#/rank" data-tab="rank"><span>🏆</span>榜单</a>
    <a href="#/about" data-nav="#/about" data-tab="about"><span>📖</span>说明</a>
  </nav>
`

// ---------- 音效开关 ----------
const soundBtn = document.getElementById('sound-toggle')
function paintSoundButton() {
  const on = isSoundOn()
  soundBtn.innerHTML = icon(on ? 'soundOn' : 'soundOff', { size: 20 })
  soundBtn.setAttribute('aria-pressed', String(on))
  soundBtn.classList.toggle('is-off', !on)
  soundBtn.title = on ? '音效：开' : '音效：关'
}
soundBtn.addEventListener('click', () => {
  setSoundOn(!isSoundOn())
  paintSoundButton()
  if (isSoundOn()) sfx.pop()
  else toast('音效已关闭')
})
paintSoundButton()

// ---------- 路由 ----------
const routes = {
  '/': HomeView,
  '/naiwa': NaiwaView,
  '/result': ResultView,
  '/rank': RankView,
  '/about': AboutView,
  '/debug': DebugView,
}

function routeOfHash(hash) {
  const raw = (hash || location.hash || '#/').replace(/^#/, '')
  const path = '/' + raw.split('?')[0].replace(/^\/+/, '').replace(/\/+$/, '')
  return path === '/' ? '/' : path
}

function paintActive(path) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const href = link.getAttribute('data-nav')
    const hrefPath = routeOfHash(href)
    const active = hrefPath === path || (path === '/result' && hrefPath === '/naiwa')
    link.classList.toggle('is-active', active)
    if (link.hasAttribute('data-tab')) link.setAttribute('aria-current', active ? 'page' : 'false')
  })
}

const router = createRouter({
  routes,
  mount: document.getElementById('view'),
  onChange({ path }) {
    paintActive(path)
    document.body.classList.remove('menu-open')
  },
})
paintActive(router.path)

// 锚点（如 /about#faq）滚动支持
window.addEventListener('hashchange', () => {
  const hash = location.hash
  const id = hash.split('#')[2]
  if (id) {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
})

installDevTools(router)
