/** 奶蛙测评：摄像头跟做优先，相册备用，全程本地比对。 */
import { NAIWA } from '../config.js'
import { naiwaArtwork, naiwaMarkSVG } from '../ui/mascot.js'
import { icon, esc, toast, formatBytes, formatSeconds } from '../ui/dom.js'
import { getNickname, setNickname, addResult, setCurrentResult } from '../store.js'
import { analyzeVideos } from '../analyze/scoring.js'
import { sampleVideo } from '../analyze/video-sampler.js'
import { createCameraSession, sampleLiveVideo, cameraErrorMessage } from '../analyze/camera.js'
import { loadPoseEngine, analyzePoseChallenge } from '../analyze/pose-runtime.js'
import { POSE_TARGETS, scorePose } from '../analyze/pose-core.js'
import { sfx } from '../ui/sfx.js'

const LIMITS = NAIWA.limits
const hasDefaultDemo = Boolean(NAIWA.demo.video)

function fileError(file) {
  if (!file) return '没有选择文件'
  if (file.type && !file.type.startsWith('video/')) return '这不是视频文件，请选择 MP4 / WebM / MOV'
  if (!file.type && !/\.(mp4|webm|mov|m4v)$/i.test(file.name || '')) return '请选择 MP4 / WebM / MOV 格式的视频'
  if (file.size > LIMITS.maxFileMB * 1024 * 1024) {
    return `视频太大了（${formatBytes(file.size)}），最大支持 ${LIMITS.maxFileMB} MB`
  }
  return ''
}

function readVideoMeta(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = url
    const timer = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 8000)
    const cleanup = () => {
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load?.()
    }
    video.onloadedmetadata = () => {
      clearTimeout(timer)
      const meta = {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      }
      cleanup()
      resolve(meta)
    }
    video.onerror = () => {
      cleanup()
      resolve(null)
    }
  })
}

function stepperMarkup({ demoOk, userOk }) {
  const items = [
    { title: '看示范', small: demoOk ? '示范已就位' : '看参考，选示范', done: demoOk, current: !demoOk },
    { title: '跟着做', small: userOk ? '动作已就位' : '摄像头 / 已有视频', done: userOk, current: demoOk && !userOk },
    { title: '本地比对', small: '完成后自动出分', done: false, current: false },
    { title: '领取称号', small: '称号卡可保存', done: false, current: false },
  ]
  return `
    <ol class="stepper">
      ${items
        .map(
          (item, i) => `
        <li class="${item.done ? 'is-done' : ''} ${item.current ? 'is-current' : ''}">
          <span class="step-dot">${item.done ? '✓' : i + 1}</span>
          <span class="step-text"><strong>${item.title}</strong><small>${item.small}</small></span>
        </li>`,
        )
        .join('')}
    </ol>`
}



function demoPanelMarkup(challenge) {
  const pose=challenge.kind==='pose'
  const steps=pose
    ? [{name:challenge.name,desc:challenge.desc},{name:'上半身入镜',desc:'请让双肩和双手留在画面中，坐着也可以。'},{name:'保持 5 秒',desc:'上半身按手臂与手腕位置匹配，表情和下肢暂不计分。'}]
    : challenge.steps
  return `
    <div class="demo-stage ${pose?'pose-demo-stage':''}">
      ${pose
        ? `<img class="pose-demo-image" src="${esc(challenge.src)}" alt="${esc(challenge.alt)}">`
        : `<video class="demo-video" controls muted playsinline preload="metadata" poster="${esc(challenge.poster||'')}" src="${esc(challenge.src)}">你的浏览器不支持视频播放。</video>`}
    </div>
    <p class="demo-credit">${pose?'姿势挑战 · 按镜像取景方向模仿参考图，保持 5 秒。':esc(challenge.credit)}</p>
    <div class="action-steps"><h3>这一轮，挑战「${esc(challenge.name)}」</h3>
      <ol>${steps.map(item=>`<li><strong>${esc(item.name)}</strong><span>${esc(item.desc)}</span></li>`).join('')}</ol>
    </div>
    <details class="reference-details" open>
      <summary>选择姿势挑战 · 五种可选</summary>
      <div class="reference-grid" role="group" aria-label="选择本轮姿势">
        ${NAIWA.references.map((ref,i)=>`<button type="button" data-challenge="${ref.id}" class="reference-card ${challenge.id===ref.id?'is-selected':''}" aria-pressed="${challenge.id===ref.id}">
          <img src="${esc(ref.src)}" alt="${esc(ref.alt)}" width="240" height="280" loading="lazy">
          <span class="reference-copy"><strong><span>${String(i+1).padStart(2,'0')}</span> ${esc(ref.name)}</strong>
          <span class="reference-description">${esc(ref.desc)}</span><span class="pose-choice-label">${challenge.id===ref.id?'✓ 本轮已选择':'选这个姿势 · 保持 5 秒'}</span></span>
        </button>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" type="button" data-challenge="laugh" aria-pressed="${challenge.id==='laugh'}">捧腹大笑 · 连续动作 15 秒</button>
    </details>
    <details class="reference-details">
      <summary>想换动作？自选一段示范</summary>
      <div class="temp-demo">
        <p class="temp-demo-desc">可选择其他连续示范视频，最长 15 秒；想测静态姿势，直接点击上方卡片即可。</p>
        <input type="file" id="temp-demo-input" accept="video/*" hidden>
        <div class="temp-demo-row">
          <button class="btn btn-ghost btn-sm" id="temp-demo-pick" type="button">${icon('upload',{size:18})} 选择其他示范</button>
          <span class="file-hint" id="temp-demo-name">使用内置捧腹大笑</span>
          <button class="btn btn-ghost btn-sm" id="temp-demo-remove" type="button" hidden>恢复内置示范</button>
        </div>
        <div class="mini-preview" id="temp-demo-preview" hidden><video id="temp-demo-video" playsinline muted controls></video></div>
      </div>
    </details>`
}
function cameraPanelMarkup(challenge) {
  const pose=challenge.kind==='pose'
  return `
    <div class="challenge-field"><label for="challenge-select">本轮挑战</label>
      <select id="challenge-select">
        <option value="laugh" ${challenge.id==='laugh'?'selected':''}>捧腹大笑 · 连续动作 15 秒</option>
        ${NAIWA.references.map(ref=>`<option value="${ref.id}" ${challenge.id===ref.id?'selected':''}>${esc(ref.name)} · 姿势保持 5 秒</option>`).join('')}
        ${challenge.id==='custom'?'<option value="custom" selected>自选连续示范</option>':''}
      </select>
    </div>
    <div class="capture-choice" role="group" aria-label="选择测试方式">
      <button type="button" data-input-mode="camera" aria-pressed="true">摄像头跟做 <small>推荐</small></button>
      <button type="button" data-input-mode="upload" aria-pressed="false">选择已有视频</button>
    </div>
    <section id="camera-mode" aria-label="摄像头跟做">
      <div class="camera-stage">
        <video id="camera-video" class="camera-video" muted autoplay playsinline aria-label="你的镜像取景画面"></video>
        <div class="camera-placeholder" id="camera-placeholder">${icon('video',{size:40})}<strong>镜头前，直接测。</strong><span>本轮：${esc(challenge.name)} · ${pose?'保持 5 秒':'跟做最多 15 秒'}</span></div>
        <div class="camera-guide" id="camera-guide" hidden><span>${pose?'双肩和双手入镜，坐着也可以':'让头、双手和膝盖留在画面内'}</span></div>
        <video id="camera-reference" class="camera-reference" muted playsinline preload="metadata" src="${esc(pose?NAIWA.demo.video:challenge.src)}" poster="${esc(NAIWA.demo.poster||'')}" aria-label="跟做示范" hidden></video>
        <img id="camera-pose-reference" class="camera-reference" src="${esc(pose?challenge.src:NAIWA.references[0].src)}" alt="${pose?esc(challenge.name):'姿势参考'}" hidden>
        <p id="pose-feedback" class="pose-feedback" role="status" aria-live="polite" hidden>先检查上半身是否入镜，再开始计时。</p>
        <div id="camera-countdown" class="camera-countdown" role="status" aria-live="polite" hidden></div>
      </div>
      <p id="camera-status" class="camera-status" role="status" aria-live="polite">无需录视频文件，也不用上传。只使用摄像头，不开启麦克风。</p>
      <div id="capture-progress" class="capture-progress" role="progressbar" aria-label="跟做进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span></span></div>
      <div class="camera-actions">
      <button id="camera-open" type="button" class="btn btn-primary btn-lg btn-block">打开摄像头，直接测 ${icon('video',{size:20})}</button>
      <button id="camera-start" type="button" class="btn btn-primary btn-lg btn-block" hidden>我准备好了，开始跟做 ${icon('spark',{size:20})}</button>
      <button id="camera-stop" type="button" class="btn btn-ghost btn-sm camera-stop" hidden>取消并关闭摄像头</button>
      </div>
      <p class="small muted camera-explainer">3 秒准备后，${pose?'按参考图摆好上半身，保持 5 秒':'跟着同步示范做最多 15 秒'}，完成后自动出分。</p>
    </section>
    <dialog id="camera-dialog" class="camera-dialog" aria-labelledby="camera-dialog-title">
      <header class="camera-dialog-head"><div><strong id="camera-dialog-title">${esc(challenge.name)}</strong><span>${pose?'上半身挑战 · 累计保持 5 秒':'连续动作 · 跟做最多 15 秒'} · 画面仅在本机处理</span></div><button id="camera-dialog-close" class="btn btn-ghost btn-sm" type="button">关闭取景</button></header>
      <div id="camera-dialog-body"></div>
    </dialog>`
}

function delay(ms, signal) {
  return new Promise((resolve,reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort',cancel) }
    const cancel = () => { cleanup(); reject(new DOMException('已取消','AbortError')) }
    const timer = setTimeout(() => { cleanup(); resolve() },ms)
    if (signal?.aborted) return cancel()
    signal?.addEventListener('abort',cancel,{once:true})
  })
}

export const NaiwaView = {
  async render(main, ctx) {
    document.title = '奶蛙 · 奶量鉴定 | 奶豪鉴定所'
    const state = {
      userFile: null,
      userUrl: null,
      userMeta: null,
      tempDemoFile: null,
      tempDemoUrl: null,
      tempDemoMeta: null,
      abort: null,
      active: true,
      error: '',
      analyzing: false,
      inputMode: 'camera',
      challengeId: 'laugh',
      cameraReady: false,
      cameraBusy: false,
      capturing: false,
      poseReady: false,
      poseFailed: false,
      loadingDemo: false,
      cameraSequence: null,
      demoSequence: null,
    }
    let tipTimer = null
    let phaseLabelEl = null
    let cameraSession = null
    let captureController = null
    let prepareVersion = 0
    let poseEngine = null
    let poseLoading = null
    let userFileRequest = 0
    let posePreviewTimer = null
    let posePreviewController = null

    function stopPosePreview() {
      clearTimeout(posePreviewTimer)
      posePreviewController?.abort()
      posePreviewController=null
      state.poseReady=false
    }

    function stopCamera() {
      stopPosePreview()
      captureController?.abort()
      captureController = null
      cameraSession?.stop()
      cameraSession = null
      state.cameraReady = state.cameraBusy = state.capturing = false
      state.poseFailed=false
      main.querySelector('#camera-reference')?.pause()
      const dialog=main.querySelector('#camera-dialog')
      if(dialog?.open) dialog.close()
      const mode=main.querySelector('#camera-mode')
      if(dialog && mode && dialog.contains(mode)) dialog.before(mode)
    }

    const demoReady = () => Boolean(hasDefaultDemo || state.tempDemoFile)
    const userReady = () => Boolean(state.inputMode === 'camera' ? state.cameraSequence : state.userFile)
    const demoSource = () => state.challengeId==='custom' ? state.tempDemoFile : NAIWA.demo.video


    function currentChallenge() {
      const ref=NAIWA.references.find(item=>item.id===state.challengeId)
      if(ref) return {...ref,kind:'pose',duration:5}
      if(state.challengeId==='custom' && state.tempDemoFile) return {
        id:'custom',kind:'video',name:'自选连续示范',src:state.tempDemoUrl,poster:'',
        credit:state.tempDemoFile.name,steps:[{name:'跟着示范做',desc:'保持镜头稳定，完整跟做所选动作。'}],
      }
      return {id:'laugh',kind:'video',name:'捧腹大笑',src:NAIWA.demo.video,poster:NAIWA.demo.poster,steps:NAIWA.demo.steps,credit:NAIWA.demo.credit}
    }
    async function ensurePoseEngine(signal) {
      if(!poseLoading) {
        poseLoading=loadPoseEngine().then(engine=>{
          if(!state.active){engine.close();throw new DOMException('已取消','AbortError')}
          poseEngine=engine
          return engine
        }).catch(error=>{
          poseLoading=null
          if(error.name==='AbortError') throw error
          throw new Error('姿势识别模型未能加载，请检查网络后重试，或切回捧腹大笑。')
        })
      }
      const engine=await poseLoading
      if(signal?.aborted) throw new DOMException('已取消','AbortError')
      return engine
    }
    function revokeUser() {
      if (state.userUrl) URL.revokeObjectURL(state.userUrl)
      state.userUrl = null
    }
    function revokeTemp() {
      if (state.tempDemoUrl) URL.revokeObjectURL(state.tempDemoUrl)
      state.tempDemoUrl = null
    }

    function paintPrepare() {
      const version = ++prepareVersion
      const challenge = currentChallenge()
      stopCamera()
      state.loadingDemo = false
      state.cameraSequence = state.demoSequence = null
      state.analyzing = false
      clearInterval(tipTimer)
      main.innerHTML = `
      <section class="page wrap quiz-page">
        <div class="quiz-head">
          <a class="back-link" href="#/">${icon('arrowLeft', { size: 16 })} 返回鉴定所</a>
          <div class="quiz-title-row">
            <div>
              <p class="eyebrow">${NAIWA.eyebrow}</p>
              <h1>${NAIWA.title}</h1>
            </div>
            <span class="metric-pill">测评指标<strong>${NAIWA.metric}</strong></span>
          </div>
          <p class="page-sub">${NAIWA.intro}</p>
        </div>

        ${stepperMarkup({ demoOk: demoReady(), userOk: userReady() })}

        <div class="workspace" id="workspace">
          <section class="panel panel-demo">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">STEP 01</p>
                <h2>先看一遍，等会儿跟着做</h2>
              </div>
              <span class="chip chip-yellow">${challenge.kind==='pose'?'保持 5 秒':NAIWA.demo.durationLabel}</span>
            </div>
            ${demoPanelMarkup(challenge)}
            <div class="tips-block">
              <h3>${icon('video', { size: 18 })} 拍摄小贴士</h3>
              <ul>${NAIWA.recordTips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
            </div>
          </section>

          <section class="panel panel-upload">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">STEP 02</p>
                <h2>轮到你，现场测奶</h2>
              </div>
              <span class="chip">${icon('lock', { size: 14 })} 本地处理</span>
            </div>

            ${cameraPanelMarkup(challenge)}
            <section id="upload-mode" aria-label="选择已有视频" hidden>
            <label class="dropzone" id="dropzone" for="video-input">
              <input type="file" id="video-input" accept="video/*" hidden />
              <span class="dropzone-icon">${icon('video', { size: 36 })}</span>
              <strong>点击上传 / 拖到这里</strong>
              <span class="dropzone-sub">MP4 / WebM / MOV · 最大 ${LIMITS.maxFileMB}MB · 建议 5–15 秒</span>
              <span class="dropzone-naiwa" aria-hidden="true">${naiwaMarkSVG()}</span>
            </label>

            <div class="upload-preview" id="upload-preview" hidden>
              <div class="preview-video">
                <video id="user-video" playsinline muted controls></video>
              </div>
              <div class="preview-meta">
                <strong id="user-file-name">—</strong>
                <span id="user-file-meta">—</span>
              </div>
              <div class="preview-actions">
                <button class="btn btn-ghost btn-sm" id="change-video" type="button">${icon('refresh', { size: 16 })} 换一个</button>
                <button class="btn btn-ghost btn-sm" id="remove-video" type="button">${icon('close', { size: 16 })} 移除</button>
              </div>
            </div>

            </section>
            <div class="field">
              <label for="nickname">你的代号 <span class="muted">（上排行榜用，可留空）</span></label>
              <input id="nickname" name="nickname" type="text" maxlength="12" autocomplete="off"
                placeholder="例如：快乐奶狗" value="${esc(getNickname())}" />
            </div>

            <div class="upload-errors" id="upload-errors" hidden></div>

            <button class="btn btn-primary btn-lg btn-block" id="start-btn" type="button" disabled>
              用这段视频鉴定 ${icon('spark', { size: 20 })}
            </button>
            <p class="upload-hint" id="start-hint">打开镜头，跟着奶蛙做一遍。</p>
            <p class="privacy-note">${icon('lock', { size: 15 })} ${esc(NAIWA.privacyNote)}</p>
          </section>
        </div>

        <div class="quiz-footnote">
          <p>${icon('spark', { size: 18 })} 本测评纯属娱乐：连续动作比对轮廓与节奏；姿势挑战比对上半身关键点，不提供专业动作指导。</p>
          <p>不方便开镜头？选择已有视频也能测。姿势视频请保持至少 3 秒，建议 5 秒，完成后统一计算。</p>
        </div>
      </section>`

      bindPrepare(version)
    }

    function bindPrepare(version) {
      const challenge = currentChallenge()
      const isPose = challenge.kind === 'pose'
      const chooseChallenge = id => {
        if(id===state.challengeId) return
        if(id!=='laugh' && !NAIWA.references.some(ref=>ref.id===id)) return
        setNickname(main.querySelector('#nickname')?.value || getNickname())
        revokeTemp()
        state.tempDemoFile=state.tempDemoMeta=null
        state.challengeId=id
        state.error=''
        paintPrepare()
      }
      for(const button of main.querySelectorAll('[data-challenge]')) {
        button.addEventListener('click',()=>{chooseChallenge(button.dataset.challenge);main.querySelector('[data-challenge="'+button.dataset.challenge+'"]').focus({preventScroll:true})})
      }
      main.querySelector('#challenge-select').addEventListener('change',event=>{chooseChallenge(event.target.value);main.querySelector('#challenge-select').focus({preventScroll:true})})
      const isCurrent = () => state.active && prepareVersion === version && !state.analyzing
      const dropzone = main.querySelector('#dropzone')
      const videoInput = main.querySelector('#video-input')
      const preview = main.querySelector('#upload-preview')
      const userVideo = main.querySelector('#user-video')
      const userName = main.querySelector('#user-file-name')
      const userMetaEl = main.querySelector('#user-file-meta')
      const errors = main.querySelector('#upload-errors')
      const startBtn = main.querySelector('#start-btn')
      const hint = main.querySelector('#start-hint')
      const nicknameInput = main.querySelector('#nickname')
      const tempInput = main.querySelector('#temp-demo-input')
      const tempPick = main.querySelector('#temp-demo-pick')
      const tempName = main.querySelector('#temp-demo-name')
      const tempRemove = main.querySelector('#temp-demo-remove')
      const tempPreview = main.querySelector('#temp-demo-preview')
      const tempVideo = main.querySelector('#temp-demo-video')
      const stepperItems = main.querySelectorAll('.stepper li')
      const cameraVideo = main.querySelector('#camera-video')
      const cameraReference = main.querySelector('#camera-reference')
      const cameraStatus = main.querySelector('#camera-status')
      const cameraOpen = main.querySelector('#camera-open')
      const cameraStart = main.querySelector('#camera-start')
      const cameraStop = main.querySelector('#camera-stop')
      const countdown = main.querySelector('#camera-countdown')
      const captureProgress = main.querySelector('#capture-progress')
      const cameraDialog=main.querySelector('#camera-dialog')
      const poseFeedback=main.querySelector('#pose-feedback')

      function updateCamera() {
        cameraOpen.hidden = state.cameraReady
        cameraOpen.disabled = state.cameraBusy || state.loadingDemo
        cameraOpen.textContent = state.cameraBusy ? '等待摄像头授权…' : '打开摄像头，直接测'
        cameraStart.hidden = !state.cameraReady
        cameraStart.disabled = !state.cameraReady || state.capturing || state.loadingDemo || (isPose && !state.poseReady && !state.poseFailed)
        cameraStart.textContent = state.capturing ? (isPose?'正在保持姿势…':'正在跟做…') : (isPose?(state.poseFailed?'重试姿势识别':state.poseReady?'入镜就绪，开始摆姿势':'正在检查入镜…'):'我准备好了，开始跟做')
        cameraStop.hidden = !state.cameraReady && !state.cameraBusy
        main.querySelector('#camera-placeholder').hidden = state.cameraReady
        main.querySelector('#camera-guide').hidden = !state.cameraReady || state.capturing
        cameraReference.hidden = !state.cameraReady || isPose
        main.querySelector('#camera-pose-reference').hidden = !state.cameraReady || !isPose
        poseFeedback.hidden = !state.cameraReady || !isPose
        tempPick.disabled = state.capturing
        tempRemove.disabled = state.capturing
      }

      async function beginPosePreview() {
        stopPosePreview()
        if(!isPose || !state.cameraReady) return
        const controller=new AbortController()
        posePreviewController=controller
        state.poseFailed=false
        poseFeedback.textContent='正在准备姿势识别，首次打开需要稍等…'
        updateCamera()
        try {
          const engine=await ensurePoseEngine(controller.signal)
          let readyCount=0
          const check=()=>{
            if(controller.signal.aborted || !state.active || !state.cameraReady || state.capturing) return
            try {
              const frame=engine.readFrame(cameraVideo,0,true)
              readyCount=frame.pose?readyCount+1:0
              state.poseReady=readyCount>=2
              const message=state.poseReady?'双肩和双手已看清，可以开始；坐着也可以。':frame.pose?'已看到上半身，请稍保持…':frame.framing
              if(poseFeedback.textContent!==message) poseFeedback.textContent=message
              poseFeedback.dataset.ready=String(state.poseReady)
              updateCamera()
              posePreviewTimer=setTimeout(check,200)
            } catch(error) { fail(error) }
          }
          check()
        } catch(error) { fail(error) }
        function fail(error) {
          if(controller.signal.aborted || !state.active) return
          state.poseFailed=true
          state.poseReady=false
          poseFeedback.textContent=error.message || '姿势识别暂时不可用，请重试。'
          updateCamera()
        }
      }

      function selectInputMode(mode, clearError = true) {
        if (state.inputMode !== mode) stopCamera()
        state.inputMode = mode
        state.cameraSequence = state.demoSequence = null
        main.querySelector('#camera-mode').hidden = mode !== 'camera'
        main.querySelector('#upload-mode').hidden = mode !== 'upload'
        startBtn.hidden = mode !== 'upload'
        for (const button of main.querySelectorAll('[data-input-mode]')) {
          button.setAttribute('aria-pressed', String(button.dataset.inputMode === mode))
        }
        countdown.hidden = true
        captureProgress.hidden = true
        cameraStatus.textContent = '无需录视频文件，也不用上传。只使用摄像头，不开启麦克风。'
        if (clearError) showError('')
        updateCamera()
        updateStart()
      }

      for (const button of main.querySelectorAll('[data-input-mode]')) {
        button.addEventListener('click', () => {
          if (state.inputMode !== button.dataset.inputMode) selectInputMode(button.dataset.inputMode)
        })
      }

      cameraOpen.addEventListener('click', async () => {
        if (state.cameraBusy || state.cameraReady) return
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          showError('当前页面无法使用摄像头。请用 HTTPS 打开，或点上方“选择已有视频”。')
          return
        }
        state.cameraBusy = true
        showError('')
        main.querySelector('#camera-dialog-body').append(main.querySelector('#camera-mode'))
        cameraDialog.showModal()
        cameraStatus.textContent = '请在浏览器提示中允许摄像头。不方便出镜时，也可以选择已有视频。'
        updateCamera()
        const session = createCameraSession(cameraVideo)
        cameraSession = session
        try {
          const opened = await session.open()
          if (!opened || !state.active || cameraSession !== session) return
          state.cameraBusy = false
          state.cameraReady = true
          cameraStatus.textContent = isPose ? '请按右上角参考图摆好上半身。看清双肩和双手后，即可开始；无需全身入镜。' : '镜头已打开。放稳手机，退后一点，让头、双手和膝盖入镜；准备好再开始。'
          for (const track of cameraVideo.srcObject.getVideoTracks()) {
            track.addEventListener('ended', () => {
              if (!state.active || cameraSession !== session) return
              stopCamera()
              state.error = '摄像头连接中断了，请重新打开镜头，或选择已有视频。'
              paintPrepare()
            }, { once: true })
          }
          updateCamera()
          if(isPose) beginPosePreview()
        } catch (error) {
          if (!state.active || cameraSession !== session) return
          stopCamera()
          cameraStatus.textContent = '这次没有打开镜头。可以重试，也可以选择已有视频。'
          showError(cameraErrorMessage(error))
          updateCamera()
        }
      })

      function closeCamera() {
        stopCamera()
        state.error = ''
        paintPrepare()
      }
      cameraStop.addEventListener('click',closeCamera)
      main.querySelector('#camera-dialog-close').addEventListener('click',closeCamera)
      cameraDialog.addEventListener('cancel',event=>{event.preventDefault();closeCamera()})

      cameraStart.addEventListener('click', async () => {
        if (!state.cameraReady || state.capturing || state.loadingDemo) return
        if(isPose && state.poseFailed) {beginPosePreview();return}
        if(isPose && !state.poseReady) return
        stopPosePreview()
        const controller = new AbortController()
        captureController = controller
        const { signal } = controller
        state.capturing = true
        showError('')
        updateCamera()
        countdown.hidden = false
        countdown.textContent = '准备中'
        cameraStatus.textContent = '正在准备参考动作，稍后开始倒计时…'
        try {

          let reference, engine
          if(isPose) {
            engine=await ensurePoseEngine(signal)
            reference={duration:5}
          } else {
            reference=await sampleVideo(demoSource(),{fps:LIMITS.sampleFps,maxDuration:LIMITS.maxDuration,signal})
            if(signal.aborted) return
            cameraReference.pause()
            cameraReference.currentTime=0
            let playTimer
            try {
              await Promise.race([
                cameraReference.play(),
                new Promise((_,reject)=>{playTimer=setTimeout(()=>reject(new Error('示范加载超时，请检查网络后重试。')),8000)}),
                delay(9000,signal),
              ])
            } finally {clearTimeout(playTimer)}
            if(signal.aborted) return
            cameraReference.pause()
            cameraReference.currentTime=0
          }
          if(signal.aborted) return
          for (const number of [3,2,1]) {
            countdown.textContent = String(number)
            cameraStatus.textContent = isPose?'准备好，倒计时结束后保持右上角的姿势。':'准备好，倒计时结束后跟右上角的奶蛙一起做。'
            await delay(1000,signal)
          }
          countdown.hidden = true
          main.querySelector('.demo-video')?.pause()
          if(!isPose) await cameraReference.play()
          if (signal.aborted) return
          captureProgress.hidden = false
          let shownSeconds = -1
          const sequence = await sampleLiveVideo(cameraVideo, {
            duration: reference.duration, fps: isPose?6:LIMITS.sampleFps, signal,
            referenceVideo: isPose?null:cameraReference,
            frameReader: isPose?(video,t)=>engine.readFrame(video,t,true):null,
            acceptFrame:isPose?frame=>Boolean(frame.pose):null,
            maxWaitDuration:20,
            onProgress: ({progress,elapsed,duration,sample}) => {
              captureProgress.firstElementChild.style.width = Math.round(progress*100) + '%'
              captureProgress.setAttribute('aria-valuenow',String(Math.round(progress*100)))
              const seconds = Math.floor(elapsed)
              if (seconds !== shownSeconds) {
                shownSeconds = seconds
                cameraStatus.textContent = isPose?`保持「${challenge.name}」 ${seconds} / 5 秒`:`正在跟做 ${seconds} / ${Math.ceil(duration)} 秒 · 跟上参考动作的节奏`
              }
              if(isPose) {
                const message=sample?.pose?`当前姿势匹配 ${Math.round(scorePose(sample.pose,POSE_TARGETS[challenge.id]))}% · 尽量保持稳定`:`计时已暂停 · ${sample?.framing||'请让双肩和双手入镜。'}`
                if(poseFeedback.textContent!==message) poseFeedback.textContent=message
                poseFeedback.dataset.ready=String(Boolean(sample?.pose))
              }
            },
          })
          if (!state.active || signal.aborted) return
          state.cameraSequence = sequence
          state.demoSequence = isPose?null:reference
          const nickname = setNickname(nicknameInput?.value || getNickname())
          stopCamera()
          paintAnalyzing(nickname)
        } catch (error) {
          if (!state.active || captureController !== controller) return
          if(isPose && error.name!=='AbortError' && state.cameraReady) {
            captureController=null
            state.capturing=false
            countdown.hidden=true
            captureProgress.hidden=true
            cameraStatus.textContent=error.message+' 镜头已保留，调整好后可以直接重试。'
            beginPosePreview()
            return
          }
          stopCamera()
          state.error = error?.name === 'AbortError' ? '' : (error?.message || '本次跟做没有完成，请重试。')
          paintPrepare()
        }
      })

      function showError(message) {
        state.error = message
        errors.hidden = !message
        errors.textContent = message || ''
        if (message) toast(message, { type: 'error', duration: 3600 })
      }

      function updateStepper() {
        if (stepperItems.length < 4) return
        stepperItems[0].className = demoReady() ? 'is-done' : 'is-current'
        stepperItems[1].className = userReady() ? 'is-done' : demoReady() ? 'is-current' : ''
      }

      function updateStart() {
        const ready = demoReady() && userReady()
        startBtn.disabled = !ready || state.loadingDemo
        const msg = state.inputMode === 'camera'
          ? '先取景，再跟做；完成后自动出分，不用保存视频文件。'
          : !demoReady()
          ? '请先选择一段示范视频。'
          : !userReady()
            ? '内置示范已就绪，选择一段你的模仿视频即可。'
            : '材料齐了，开始鉴定！视频只在本机处理。'
        hint.textContent = msg
        hint.classList.toggle('is-ready', ready)
        updateStepper()
      }

      function paintUserPreview() {
        if (!state.userFile) {
          dropzone.hidden = false
          preview.hidden = true
          return
        }
        dropzone.hidden = true
        preview.hidden = false
        if (userVideo && state.userUrl) userVideo.src = state.userUrl
        if (userName) userName.textContent = state.userFile.name
        if (userMetaEl) {
          const parts = [formatBytes(state.userFile.size)]
          if (state.userMeta) {
            parts.push(formatSeconds(state.userMeta.duration))
            if (state.userMeta.width && state.userMeta.height) {
              parts.push(`${state.userMeta.width}×${state.userMeta.height}`)
            }
          }
          userMetaEl.textContent = parts.join(' · ')
        }
      }

      function paintTempDemo() {
        if (!tempInput) return
        if(isPose) cameraReference.removeAttribute('src')
        else cameraReference.src = challenge.src
        if (!state.tempDemoFile) {
          if (tempName) tempName.textContent = '使用内置捧腹大笑'
          if (tempRemove) tempRemove.hidden = true
          if (tempPreview) tempPreview.hidden = true
          return
        }
        if (tempName) tempName.textContent = state.tempDemoFile.name
        if (tempRemove) tempRemove.hidden = false
        if (tempPreview) tempPreview.hidden = false
        if (tempVideo && state.tempDemoUrl) tempVideo.src = state.tempDemoUrl
      }

      async function acceptUserFile(file) {
        if (state.capturing) return
        const request=++userFileRequest
        const err = fileError(file)
        if (err) {
          showError(err)
          return
        }
        showError('')
        const url = URL.createObjectURL(file)
        const meta = await readVideoMeta(url)
        if (!state.active || state.analyzing || request!==userFileRequest) {
          URL.revokeObjectURL(url)
          return
        }
        if (!meta) {
          URL.revokeObjectURL(url)
          showError('这个视频读不出来，请换一个 MP4 试试')
          return
        }
        if (meta.duration && meta.duration < LIMITS.minDuration) {
          showError('视频太短了，至少录满 1 秒，最好完整拍下整段动作')
          URL.revokeObjectURL(url)
          return
        }
        revokeUser()
        state.userFile = file
        state.userUrl = url
        state.userMeta = meta
        if(!isCurrent()) {
          state.inputMode='upload'
          paintPrepare()
          return
        }
        selectInputMode('upload')
        if (meta.duration && meta.duration > LIMITS.maxDuration) {
          showError(`视频有 ${formatSeconds(meta.duration)}，超过 ${LIMITS.maxDuration} 秒的部分不会参与比对。建议剪到 15 秒以内。`)
        } else {
          showError('')
        }
        paintUserPreview()
        updateStart()
        sfx.pop()
      }

      async function acceptTempDemo(file) {
        if (state.capturing || state.loadingDemo) return
        const err = fileError(file)
        if (err) {
          showError(err)
          return
        }
        showError('')
        const url = URL.createObjectURL(file)
        state.loadingDemo = true
        updateCamera()
        updateStart()
        const meta = await readVideoMeta(url)
        if (!isCurrent()) {
          URL.revokeObjectURL(url)
          return
        }
        state.loadingDemo = false
        updateCamera()
        updateStart()
        if (!meta) {
          URL.revokeObjectURL(url)
          showError('示范视频读不出来，请换一个 MP4 试试')
          return
        }
        if (meta.duration && meta.duration < LIMITS.minDuration) {
          URL.revokeObjectURL(url)
          showError('示范视频太短，请选择至少 1 秒的连续动作。')
          return
        }
        revokeTemp()
        state.tempDemoFile = file
        state.tempDemoUrl = url
        state.tempDemoMeta = meta
        state.challengeId='custom'
        paintPrepare()
        toast('临时示范已就位，可以开始测奶了', { type: 'ok' })
        sfx.pop()
      }

      videoInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) acceptUserFile(file)
      })

      tempInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) acceptTempDemo(file)
      })

      tempPick?.addEventListener('click', () => tempInput?.click())

      tempRemove?.addEventListener('click', () => {
        if (state.capturing) return
        revokeTemp()
        state.tempDemoFile = null
        state.tempDemoUrl = null
        state.tempDemoMeta = null
        state.challengeId='laugh'
        paintPrepare()
      })

      main.querySelector('#change-video')?.addEventListener('click', () => videoInput?.click())
      main.querySelector('#remove-video')?.addEventListener('click', () => {
        revokeUser()
        state.userFile = null
        state.userUrl = null
        state.userMeta = null
        if (userVideo) userVideo.removeAttribute('src')
        paintUserPreview()
        updateStart()
      })

      // 拖拽上传
      ;['dragenter', 'dragover'].forEach((ev) =>
        dropzone?.addEventListener(ev, (e) => {
          e.preventDefault()
          dropzone.classList.add('is-drag')
        }),
      )
      ;['dragleave', 'drop'].forEach((ev) =>
        dropzone?.addEventListener(ev, (e) => {
          e.preventDefault()
          dropzone.classList.remove('is-drag')
        }),
      )
      dropzone?.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0]
        if (file) acceptUserFile(file)
      })

      startBtn?.addEventListener('click', () => {
        if (!demoReady() || !userReady()) return
        const nickname = setNickname(nicknameInput?.value || getNickname())
        paintAnalyzing(nickname)
      })

      // 恢复上一次选择
      selectInputMode(state.inputMode, false)
      paintUserPreview()
      paintTempDemo()
      if (state.error) {
        errors.hidden = false
        errors.textContent = state.error
      }
      updateStart()
    }

    function paintAnalyzing(nickname) {
      prepareVersion++
      stopCamera()
      state.loadingDemo = false
      state.analyzing = true
      const controller = new AbortController()
      state.abort = controller
      const tips = NAIWA.analysisTips
      let tipIndex = 0
      const phaseNames = {
        demo: '正在读取示范动作',
        user: '正在读取你的动作',
        compare: '正在逐帧比对奶量',
        done: '正在生成你的称号',
      }
      main.innerHTML = `
      <section class="page wrap analyzing-page">
        <div class="analysis-chamber">
          <p class="eyebrow">MILK ANALYZING</p>
          <div class="radar">
            <span class="radar-ring r1"></span>
            <span class="radar-ring r2"></span>
            <span class="radar-ring r3"></span>
            ${naiwaArtwork({ mood: 'judge' })}
            <span class="radar-scan"></span>
          </div>
          <h1 class="analyzing-title" id="phase-label">${phaseNames.demo}</h1>
          <p class="analyzing-detail muted" id="phase-detail">正在打开你的视频…</p>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <p class="progress-num" id="progress-num">0%</p>
          <p class="analysis-tip" id="analysis-tip">${tips[0]}</p>
          <button class="btn btn-ghost btn-sm" id="cancel-analysis" type="button">${icon('close', { size: 16 })} 取消检测</button>
          <p class="privacy-note">${icon('lock', { size: 15 })} 视频只在本机处理，请保持页面在前台</p>
        </div>
      </section>`

      const fill = main.querySelector('#progress-fill')
      const num = main.querySelector('#progress-num')
      const bar = main.querySelector('#progress-bar')
      const label = main.querySelector('#phase-label')
      const detail = main.querySelector('#phase-detail')
      const tipEl = main.querySelector('#analysis-tip')
      const cancelBtn = main.querySelector('#cancel-analysis')
      phaseLabelEl = label

      tipTimer = setInterval(() => {
        tipIndex = (tipIndex + 1) % tips.length
        if (tipEl) tipEl.textContent = tips[tipIndex]
      }, 1800)

      const onProgress = ({ phase, ratio, detail: text }) => {
        if (!state.active) return
        const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100)
        if (fill) fill.style.width = percent + '%'
        if (num) num.textContent = percent + '%'
        if (bar) bar.setAttribute('aria-valuenow', String(percent))
        if (label && phaseNames[phase] && label.textContent !== phaseNames[phase]) {
          label.textContent = phaseNames[phase]
          sfx.tick()
        }
        if (detail && text) detail.textContent = text
      }

      cancelBtn?.addEventListener('click', () => {
        controller.abort()
        toast('已取消检测，视频没有上传，随时可以重来。')
        paintPrepare()
      })

      const referenceSource = demoSource()
      const challenge = currentChallenge()
      ;(async () => {
        try {

          let result
          if(challenge.kind==='pose') {
            const engine=state.cameraSequence?null:await ensurePoseEngine(controller.signal)
            result=await analyzePoseChallenge({
              reference:challenge,userSource:state.userFile,userSequence:state.cameraSequence,
              engine,signal:controller.signal,onProgress,
            })
          } else {
            result=await analyzeVideos({
              demoSource:referenceSource,userSource:state.userFile,
              demoSequence:state.demoSequence,userSequence:state.cameraSequence,
              signal:controller.signal,onProgress,
            })
          }
          result.challengeId=challenge.id
          result.challengeName=challenge.name
          if (!state.active || controller.signal.aborted) return
          clearInterval(tipTimer)
          const finalNickname = setNickname(nickname || getNickname())
          result.nickname = finalNickname
          result.clientFinishedAt = new Date().toISOString()
          addResult(result)
          setCurrentResult(result)
          ctx.go('#/result')
        } catch (err) {
          if (!state.active || controller.signal.aborted) return
          clearInterval(tipTimer)
          if (err?.name === 'AbortError') {
            paintPrepare()
            return
          }
          console.error('[naiwa] 鉴定失败', err)
          state.error = err?.message || '鉴定失败了，请重试'
          paintPrepare()
          toast(state.error, { type: 'error', duration: 4200 })
        }
      })()
    }

    const onVisibility = () => {
      if (document.hidden && cameraSession) {
        stopCamera()
        if (state.active) {
          state.error = '页面切到后台，本次跟做已停止，摄像头已关闭。回来后可以重新开始。'
          paintPrepare()
        }
      }
    }
    const onPageHide = () => {
      const hadCamera = Boolean(cameraSession)
      stopCamera()
      if (hadCamera && state.active && !state.analyzing) {
        state.error = '离开页面时已关闭摄像头，回来后可以重新打开。'
        paintPrepare()
      }
    }
    document.addEventListener('visibilitychange',onVisibility)
    window.addEventListener('pagehide',onPageHide)
    paintPrepare()

    return () => {
      state.active = false
      poseEngine?.close()
      poseEngine = null
      stopCamera()
      state.cameraSequence = state.demoSequence = null
      document.removeEventListener('visibilitychange',onVisibility)
      window.removeEventListener('pagehide',onPageHide)
      state.abort?.abort()
      clearInterval(tipTimer)
      revokeUser()
      revokeTemp()
    }
  },
}
