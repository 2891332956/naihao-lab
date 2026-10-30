/**
 * 极简 Hash 路由：views 注册为 { path: { render(container, ctx) } }
 * 每个 view 的 render 可以返回一个 cleanup 函数，路由切换时自动调用。
 */
export function createRouter({ routes, mount, onChange }) {
  let cleanup = null
  let currentPath = null

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/'
    const [pathPart, queryPart = ''] = raw.split('?')
    let path = '/' + pathPart.replace(/^\/+/, '')
    path = path.replace(/\/+$/, '') || '/'
    return { path, query: new URLSearchParams(queryPart) }
  }

  function go(href, { replace = false } = {}) {
    const target = href.startsWith('#') ? href : '#' + href
    if (replace) {
      history.replaceState(null, '', target)
      render()
    } else if (location.hash === target) {
      render()
    } else {
      location.hash = target
    }
  }

  async function render() {
    const { path, query } = parseHash()
    if (path === currentPath) return
    const view = routes[path]
    try {
      if (typeof cleanup === 'function') cleanup()
    } catch (err) {
      console.warn('[router] cleanup error', err)
    }
    cleanup = null
    currentPath = path
    mount.innerHTML = ''
    document.body.dataset.route = path === '/' ? 'home' : path.replace(/\//g, '')
    if (!view) {
      mount.innerHTML = `
        <div class="wrap empty-state">
          <p class="empty-emoji">🟡</p>
          <h1>这里没有奶，只有 404</h1>
          <p class="muted">页面走丢了，回首页重新测一次奶量吧。</p>
          <a class="btn btn-primary" href="#/">回首页</a>
        </div>`
      document.title = '404 · 奶豪鉴定所'
      return
    }
    try {
      cleanup = await view.render(mount, { query, path, go })
    } catch (err) {
      console.error('[router] render error', err)
      mount.innerHTML = `
        <div class="wrap empty-state">
          <p class="empty-emoji">😵‍💫</p>
          <h1>奶量过载，渲染失败</h1>
          <p class="muted">${String(err?.message || err)}</p>
          <button class="btn btn-primary" type="button" onclick="location.reload()">重新加载</button>
        </div>`
    }
    onChange?.({ path, query })
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }

  window.addEventListener('hashchange', render)
  render()

  return {
    go,
    refresh: render,
    get path() {
      return currentPath
    },
  }
}

export const routeLink = (path) => (path.startsWith('#') ? path : '#' + path)
