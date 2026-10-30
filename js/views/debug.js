/** 调试台（内部用）：上传两段视频看评分明细 / 生成预览结果 / 端到端自检 */
import { icon, toast, formatBytes, formatSeconds } from '../ui/dom.js'
import { analyzeVideos } from '../analyze/scoring.js'

export const DebugView = {
  async render(main) {
    document.title = '调试台 | 奶豪鉴定所'
    main.innerHTML = `
    <section class="page wrap debug-page">
      <div class="quiz-head">
        <a class="back-link" href="#/">${icon('arrowLeft', { size: 16 })} 返回首页</a>
        <p class="eyebrow">INTERNAL TOOL</p>
        <h1>调试台</h1>
        <p class="page-sub">
          内部使用：上传「示范视频 + 测试视频」，查看评分明细与原始指标，用于素材校准。
          或者直接生成一条演示结果预览 UI，不用准备视频。
        </p>
      </div>

      <div class="debug-grid">
        <label class="debug-file">
          <span>示范视频</span>
          <input type="file" id="dbg-demo" accept="video/*" />
          <small id="dbg-demo-name">未选择</small>
        </label>
        <label class="debug-file">
          <span>测试视频</span>
          <input type="file" id="dbg-user" accept="video/*" />
          <small id="dbg-user-name">未选择</small>
        </label>
      </div>

      <div class="debug-actions">
        <button class="btn btn-primary" id="dbg-run" type="button">运行分析 ${icon('spark', { size: 18 })}</button>
        <button class="btn btn-ghost" id="dbg-selftest" type="button">端到端自检（合成视频）</button>
      </div>
      <p class="muted small" id="dbg-progress"></p>
      <pre class="debug-out" id="dbg-out">等待运行…</pre>

      <div class="panel debug-preview">
        <h2>快速预览结果页</h2>
        <p class="muted small">生成一条演示结果（写入本机排行榜并跳转结果页），用于检查 UI 与称号卡。</p>
        <div class="debug-preview-btns">
          <button class="btn btn-ghost" data-preview="98.6" type="button">98.6 · 奶王</button>
          <button class="btn btn-ghost" data-preview="86.4" type="button">86.4 · 奶后</button>
          <button class="btn btn-ghost" data-preview="62.3" type="button">62.3 · 奶家人</button>
          <button class="btn btn-ghost" data-preview="41.5" type="button">41.5 · 奶狗</button>
          <button class="btn btn-ghost" data-preview="18.0" type="button">18.0 · 奶使</button>
        </div>
      </div>
    </section>`

    const demoInput = main.querySelector('#dbg-demo')
    const userInput = main.querySelector('#dbg-user')
    const out = main.querySelector('#dbg-out')
    const progress = main.querySelector('#dbg-progress')
    const files = { demo: null, user: null }

    const paintName = (which, file) => {
      const el = main.querySelector(which === 'demo' ? '#dbg-demo-name' : '#dbg-user-name')
      if (el) el.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : '未选择'
    }

    demoInput.addEventListener('change', (e) => {
      files.demo = e.target.files?.[0] || null
      paintName('demo', files.demo)
    })
    userInput.addEventListener('change', (e) => {
      files.user = e.target.files?.[0] || null
      paintName('user', files.user)
    })

    main.querySelector('#dbg-run').addEventListener('click', async () => {
      if (!files.demo || !files.user) {
        toast('先选择示范视频和测试视频', { type: 'error' })
        return
      }
      const btn = main.querySelector('#dbg-run')
      btn.disabled = true
      out.textContent = '分析中…'
      try {
        const result = await analyzeVideos({
          demoSource: files.demo,
          userSource: files.user,
          onProgress: (p) => {
            progress.textContent = `${p.phase} · ${Math.round(p.ratio * 100)}% ${p.detail || ''}`
          },
        })
        out.textContent = JSON.stringify(result, null, 2)
        progress.textContent = '完成'
        toast('分析完成', { type: 'ok' })
      } catch (err) {
        out.textContent = '分析失败：' + (err?.message || err)
        toast('分析失败：' + (err?.message || err), { type: 'error' })
      } finally {
        btn.disabled = false
      }
    })

    main.querySelector('#dbg-selftest').addEventListener('click', async () => {
      const btn = main.querySelector('#dbg-selftest')
      btn.disabled = true
      out.textContent = '正在录制合成测试视频并跑全链路（大约 20–40 秒）…'
      progress.textContent = 'running self test…'
      try {
        const result = await window.__LAB__.selfTest()
        out.textContent = JSON.stringify(result, null, 2)
        progress.textContent = result.pass ? '自检通过 ✅' : '自检未通过 ❌'
        toast(result.pass ? '端到端自检通过' : '端到端自检未通过，看输出', {
          type: result.pass ? 'ok' : 'error',
          duration: 4200,
        })
      } catch (err) {
        out.textContent = '自检失败：' + (err?.stack || err)
        progress.textContent = '自检失败'
      } finally {
        btn.disabled = false
      }
    })

    main.querySelectorAll('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.__LAB__.fakeResult(Number(btn.dataset.preview))
      })
    })

    return () => {}
  },
}
