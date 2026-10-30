/** 鉴定说明：称号规则 / 算法说明 / 隐私 / FAQ / 免责声明 */
import { RANKS, FAQ, ALGO_FACTS, SITE, JIAHAO, NAIWA } from '../config.js'
import { naiwaArtwork } from '../ui/mascot.js'
import { icon, esc } from '../ui/dom.js'

export const AboutView = {
  async render(main) {
    document.title = '鉴定说明 | 奶豪鉴定所'
    main.innerHTML = `
    <section class="page wrap about-page">
      <div class="about-head">
        <p class="eyebrow">RULES & DISCLAIMER</p>
        <h1>鉴定说明</h1>
        <p class="page-sub">
          这里是「奶豪鉴定所」的完整说明书。奶家人值怎么算、称号怎么分、你的视频去了哪里，都在下面。
        </p>
      </div>

      <div class="about-grid">
        <section class="panel about-block">
          <div class="panel-head">
            <div>
              <p class="panel-kicker">LEVELS</p>
              <h2>五档称号规则</h2>
            </div>
            <span class="chip">按奶家人值划分</span>
          </div>
          <div class="rule-list">
            ${RANKS.map(
              (rank) => `
              <div class="rule-row" style="--tile:${rank.color};--tile-soft:${rank.colorSoft}">
                <span class="rule-icon" aria-hidden="true">${rank.icon}</span>
                <div class="rule-main">
                  <strong>${rank.name}<small>${rank.en}</small></strong>
                  <p>${rank.tagline}</p>
                </div>
                <span class="rule-range">${rank.min}–${rank.max ?? 100} 分</span>
              </div>`,
            ).join('')}
          </div>
          <p class="rule-note">分档线写死在 <code>js/config.js</code> 的 RANKS 里，想调直接改，改完刷新即可。</p>
        </section>

        <section class="panel about-block about-naiwa-panel">
          <div class="about-naiwa-copy">
            <p class="panel-kicker">一图流</p>
            <h2>奶量等级一览</h2>
            <p>奶王 &gt; 奶后 &gt; 奶家人 &gt; 奶狗 &gt; 奶使</p>
            <p class="muted small">分数越高，奶味越正。每一档都有自己的形象，欢迎回家。</p>
            <p class="muted small">${esc(NAIWA.identity)}</p>
          </div>
          <div class="about-naiwa">${naiwaArtwork({ mood: 'happy', sign: '五档' })}</div>
        </section>
      </div>

      <section class="section about-section">
        <div class="section-head">
          <p class="eyebrow">HOW IT SCORES</p>
          <h2 class="section-title">分数是怎么算出来的</h2>
          <p class="section-sub">没有 AI 大模型，也不上传视频；就是一套老实巴交的动作结构比对。</p>
        </div>
        <div class="facts-grid">
          ${ALGO_FACTS.map(
            (fact) => `
            <article class="fact-card">
              <span class="fact-icon" aria-hidden="true">${fact.icon}</span>
              <h3>${fact.title}</h3>
              <p>${fact.desc}</p>
            </article>`,
          ).join('')}
        </div>
        <div class="panel algorithm-note">
          <h3>技术细节（给好奇的奶家人）</h3>
          <ol>
            <li>浏览器把示范与相册视频抽成最多 96 帧灰度小图（64×64）；摄像头方式直接在内存中采样同样规格的画面，不录制视频文件。</li>
            <li>用时间中位数估计静态背景，提取动作前景轮廓与运动能量图，尽量不受衣服颜色、机位、光线影响。</li>
            <li>用 DTW 动态时间规整对齐两段动作序列，允许你比示范慢半拍或快半拍。</li>
            <li>沿对齐路径计算动作轮廓相似度、节奏包络相关性、平均运动强度和动作覆盖率。</li>
            <li>加权（动作 55% / 节奏 20% / 能量 15% / 完成度 10%）后平滑映射到 0–100 分，再按分档线给称号。</li>
          </ol>
          <p class="muted small">
            这是轻量动作结构比对方案，<strong>不是专业人体姿态识别</strong>；镜头角度、背景复杂度、遮挡都会影响结果。
            后续可以替换成姿态关键点模型，分数会更准。
          </p>
        </div>
      </section>

      <section class="section about-section">
        <div class="section-head">
          <p class="eyebrow">PRIVACY</p>
          <h2 class="section-title">你的视频去了哪里</h2>
        </div>
        <div class="privacy-cards">
          <div class="privacy-card">
            <span aria-hidden="true">🔒</span>
            <h3>画面只在本机</h3>
            <p>点击后才请求摄像头，只取画面、不使用麦克风。跟做完成、取消、离开测评或切到后台时关闭镜头；相册视频也不上传。</p>
          </div>
          <div class="privacy-card">
            <span aria-hidden="true">🫥</span>
            <h3>不认脸，只认动作</h3>
            <p>比对过程只使用灰度化和前景轮廓，不提取人脸特征，不保存任何截图或视频帧。</p>
          </div>
          <div class="privacy-card">
            <span aria-hidden="true">💾</span>
            <h3>成绩只存本机</h3>
            <p>昵称、分数、称号会存进浏览器的 localStorage，方便你自己回看排行榜；清空浏览器数据即可删除。</p>
          </div>
        </div>
        <p class="privacy-line">${icon('lock', { size: 16 })} ${esc(NAIWA.privacyNote)}</p>
      </section>

      <section class="section about-section" id="faq">
        <div class="section-head">
          <p class="eyebrow">FAQ</p>
          <h2 class="section-title">奶家人常见问题</h2>
        </div>
        <div class="faq-list">
          ${FAQ.map(
            (item, i) => `
            <details class="faq-item" ${i === 0 ? 'open' : ''}>
              <summary>${esc(item.q)}</summary>
              <p>${esc(item.a)}</p>
            </details>`,
          ).join('')}
        </div>
      </section>

      <section class="about-jiahao">
        <div class="about-jiahao-copy">
          <p class="eyebrow eyebrow-light">NEXT MODULE</p>
          <h2>${JIAHAO.title}</h2>
          <p>${JIAHAO.intro}</p>
          <div class="tag-row">
            ${JIAHAO.traits.map((t) => `<span class="tag tag-dark">${esc(t)}</span>`).join('')}
          </div>
          <p class="about-jiahao-note">${JIAHAO.note}</p>
        </div>
        <span class="about-jiahao-quote">“${JIAHAO.quote}”</span>
      </section>

      <section class="disclaimer">
        <h2>免责声明</h2>
        <p>
          本站是网友自制的网络热梗同人趣味企划，与任何品牌、艺人、学校、平台均无关。奶蛙、嘉豪等梗源自互联网公开内容，版权归原作者所有。
        </p>
        <p>
          测评为娱乐向动作比对，分数、称号、排名均为整活，不构成任何专业测评或人格评价。请理性玩梗，不要用测评结果评价真实的自己或他人。
        </p>
        <p class="muted small">© ${SITE.year} ${SITE.name} · ${SITE.tagline}</p>
      </section>

      <div class="about-cta">
        <a class="btn btn-primary btn-lg" href="#/naiwa">我已经懂了，开始测奶 ${icon('arrowRight', { size: 20 })}</a>
      </div>
    </section>`

    return () => {}
  },
}
