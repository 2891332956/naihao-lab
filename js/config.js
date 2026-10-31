/**
 * 奶豪鉴定所 · 全站配置与文案
 * ------------------------------------------------------------------
 * 素材接入说明：
 *   1. 把奶蛙示范视频放到 assets/demo/ 下；
 *   2. 修改下方 NAIWA.demo.video / poster 为相对路径；
 *   3. 补充 NAIWA.demo.steps（动作拆解）；当前已内置捧腹大笑参考。
 * 想调分档线：直接改 RANKS[].min（从高到低排列，最小档位 min 必须为 0）。
 */

export const SITE = {
  name: '奶豪鉴定所',
  en: 'NAIHAO LAB',
  tagline: '互联网抽象行为鉴定中心',
  description:
    '打开摄像头，跟着奶蛙做一遍，领取你的「奶家人值」和专属称号：奶王、奶后、奶家人、奶狗、奶使。也可选择已有视频，画面不出本机，纯属娱乐。',
  version: '0.1.0',
  year: 2026,
}

/** 顶部滚动弹幕 */
export const TICKER = [
  '奶王出没，请注意',
  '已累计鉴定 114,514 位奶家人',
  '视频不上传服务器 · 全程本地计算',
  '嘉豪模块 · 打碟动作采集中',
  '奶使快乐起飞，奶狗活力上线',
  '沙县小吃：奶家人必吃榜',
  '本测评纯属娱乐，分数不代表任何真实能力',
]

export const NAV = [
  { label: '首页', href: '#/' },
  { label: '奶蛙鉴定', href: '#/naiwa' },
  { label: '排行榜', href: '#/rank' },
  { label: '鉴定说明', href: '#/about' },
]

/** 五个称号：历史 ID 保持稳定，显示名/图片与新素材一致。min 为分数下限，含。 */
export const RANKS = [
  {
    id: 'naiwang',
    image: './material/奶王.jpg',
    imageAlt: '身着金黑帝袍、手持玉玺的黄色奶蛙',
    name: '奶王',
    en: 'MILK KING',
    icon: '👑',
    min: 90,
    max: 100,
    color: '#FFD35C',
    colorSoft: '#FFF0C2',
    tagline: '蛙见蛙低头，奶见奶让路。',
    desc: '动作、节奏、奶量三线齐飞。你不是在模仿奶蛙，你就是奶蛙本蛙。奶界王座，今天起由你坐。',
    roast: '建议直接出道，民间已经装不下你的奶量了。',
    shareLine: '本奶家人值已封王，速来朝拜。',
  },
  {
    id: 'naihou',
    image: './material/奶后.jpg',
    imageAlt: '抱着锅、留着黑色长发的黄色奶后',
    name: '奶后',
    en: 'MILK QUEEN',
    icon: '🎀',
    min: 75,
    max: 89,
    color: '#FF9CB8',
    colorSoft: '#FFE1EA',
    tagline: '一颦一笑，皆是奶味。',
    desc: '奶量深不可测，气质拿捏到位，只差一顶王冠的距离。全网奶家人已经在给你建超话了。',
    roast: '王座就在前面，再奶一点点就够了。',
    shareLine: '距离奶王只差一口气，奶后驾到。',
  },
  {
    id: 'naijiaren',
    image: './material/奶家人.jpg',
    imageAlt: '举着奶家人旗帜的黄色奶蛙',
    name: '奶家人',
    en: 'MILK FAMILY',
    icon: '🏠',
    min: 55,
    max: 74,
    color: '#87D96B',
    colorSoft: '#DDF5CF',
    tagline: '欢迎回家，饭在锅里。',
    desc: '动作有模有样，奶味纯正，根正苗红。你已经是奶家编内人员了，沙县小吃给你留了靠窗的位置。',
    roast: '离封王只差一顿沙县小吃的距离。',
    shareLine: '根正苗红，正式加入奶家花名册。',
  },
  {
    id: 'naitou',
    image: './material/奶狗.jpg',
    imageAlt: '笑着摇尾巴的黄色奶狗',
    name: '奶狗',
    en: 'MILK DOG',
    icon: '🐶',
    min: 35,
    max: 54,
    color: '#8ED0FF',
    colorSoft: '#DDF1FF',
    tagline: '奶劲正上头，快乐摇尾巴。',
    desc: '奶量初露锋芒，快乐全写在脸上。再跟着示范练一遍，让节奏和动作一起上分。',
    roast: '建议放开一点，下一轮朝奶家人冲刺。',
    shareLine: '奶狗上线，下一站奶家人。',
  },
  {
    id: 'naipizi',
    image: './material/奶使.jpg',
    imageAlt: '身披白袍、展开金色翅膀的奶使',
    name: '奶使',
    en: 'MILK ANGEL',
    icon: '🪽',
    min: 0,
    max: 34,
    color: '#E8D8C3',
    colorSoft: '#F8EEE1',
    tagline: '奶使初降临，快乐先飞起。',
    desc: '刚刚降临奶界，先展开快乐的翅膀。动作和节奏还有成长空间，跟着奶蛙再来一次。',
    roast: '奶使已就位，下一轮记得把动作也带上。',
    shareLine: '奶使降临，快乐先飞一步。',
  },
]

/** 分数 → 称号（含边界） */
export function rankForScore(score) {
  const v = Number(score) || 0
  return RANKS.find((r) => v >= r.min) || RANKS[RANKS.length - 1]
}

/** 当前称号的上一档（用于「距离下一档还差多少」），已是最高档返回 null */
export function nextRankFor(rankId) {
  const idx = RANKS.findIndex((r) => r.id === rankId)
  if (idx <= 0) return null
  return RANKS[idx - 1]
}

/** 首页双模块 */
export const MODULES = [
  {
    id: 'naiwa',
    no: '01',
    title: '奶蛙 · 奶量鉴定',
    metric: '奶家人值',
    status: 'open',
    emoji: '🟡',
    desc: '跟着奶蛙的示范动起来。你的动作越像，奶家人值越高。五档称号，看看你能奶到哪一层。',
    tags: ['动作比对', '五档称号', '本地计算'],
    href: '#/naiwa',
    cta: '开始测奶',
  },
  {
    id: 'jiahao',
    no: '02',
    title: '嘉豪 · 豪意鉴定',
    metric: '豪意值',
    status: 'soon',
    emoji: '🕶️',
    desc: '黑卫衣、黑口罩、黑耳机，站上讲台开始打碟。测测你身上有多少「又装又酷」的豪意值。',
    tags: ['打碟手势', '全黑三件套', '就很你懂吧'],
    href: '#/about',
    cta: '敬请期待',
    quote: '就很……你懂吧。',
  },
]

/** 奶蛙模块配置 */
export const NAIWA = {
  id: 'naiwa',
  eyebrow: 'MODULE 01 / 奶蛙',
  title: '奶蛙 · 奶量鉴定',
  metric: '奶家人值',
  short: '奶量',
  intro: '先选挑战，再打开镜头：捧腹大笑跟做 15 秒，也可以选择下方任意姿势保持 5 秒。不方便开镜头，也能选择已有视频。',
  identity: '黄色梨形身体、浅色圆肚子、绿色眼圈、深色手脚。奶蛙是网友二创的抽象生物，认准这只黄乎乎的奶家人。',
  references: [
    { id: 'belly', name: '捧腹预备', desc: '双手放在肚子前，肩膀放松，拿捏那一点呆呆的奶味。', src: './material/clean/naiwa-belly.webp', alt: '黄色梨形奶蛙，绿色眼圈，双手捧着浅色大肚子' },
    { id: 'wave', name: '抬手开架', desc: '屈膝站稳，一只手向外抬起，另一只手收在身前。', src: './material/clean/naiwa-wave.webp', alt: '黄色奶蛙屈膝站立，一手抬起、一手收在肚子前' },
    { id: 'mirror', name: '另一侧也来', desc: '换一侧抬手，留意手臂角度和身体重心。', src: './material/clean/naiwa-mirror.webp', alt: '黄色奶蛙向另一侧抬起深色手掌' },
    { id: 'fold', name: '抱臂定格', desc: '双臂交叠在身前，身体放松，淡定地看向镜头。', src: './material/clean/naiwa-fold.webp', alt: '绿眼圈的黄色奶蛙抱臂站立，露出浅色圆肚子' },
    { id: 'think', name: '扶额收势', desc: '一只手扶额，轻轻歪头，把表情也一起模仿到位。', src: './material/d74f94dc31d701b13202141356ffc4f9.jpg', alt: '黄色奶蛙歪头扶额，另一只手臂横放在身前' },
  ],
  visuals: { happy: 'wave', judge: 'fold', shock: 'think' },
  demo: {
    video: './material/optimized/naiwa-laugh-30fps.mp4',
    poster: './material/optimized/naiwa-laugh-poster.jpg',
    title: '奶蛙 · 捧腹大笑参考',
    durationLabel: '跟做 15 秒',
    credit: '内置参考：奶蛙捧腹大笑 · 原始 30fps 动作素材；本轮比对前 15 秒。',
    // 素材到位后补充动作拆解，例如：
    // steps: [
    //   { name: '起手式', desc: '双手捧腹，放松站稳' },
    //   { name: '核心动作', desc: '屈膝抬手，换侧展开' },
    //   { name: '收尾定格', desc: '单手比耶，定格两秒' },
    // ],
    steps: [
      { name: '双手捧腹', desc: '双手放在肚子前，放松肩膀，先找到奶蛙的姿态。' },
      { name: '跟着笑起来', desc: '跟随示范仰头、前倾和身体起伏，留意停顿与节奏。' },
      { name: '完整做完', desc: '保持镜头稳定，跟到进度结束，随后自动生成称号。' },
    ],
  },
  tempMode: {
    title: '可选 · 自己换一段示范',
    desc: '默认已提供捧腹大笑示范。想测试其他动作时，可以自己选择一段连续示范视频。',
    badge: '内置参考已就绪',
  },
  recordTips: [
    '手机放稳，头、双手和膝盖尽量留在取景框内',
    '光线充足，背景别太乱',
    '把整段动作完整录完，不要提前停',
    '手机放稳，别一边拍一边晃',
  ],
  limits: {
    maxFileMB: 80,
    minDuration: 1,
    maxDuration: 15,
    sampleFps: 12,
  },
  privacyNote: '摄像头画面和相册视频只在本机比对，不上传、不保存画面；不开启麦克风。',
  analysisTips: [
    '正在偷看你的奶量…',
    '奶蛙正在鉴定你的动作成分…',
    '正在把奶味换算成分数…',
    '蛙眼识别中：这动作有点东西',
    '正在和示范动作逐帧对质…',
    '奶量数据加密中（并没有）',
  ],
}

/** 嘉豪模块（预告占位，后续开发） */
export const JIAHAO = {
  id: 'jiahao',
  eyebrow: 'MODULE 02 / 嘉豪',
  title: '嘉豪 · 豪意鉴定',
  metric: '豪意值',
  status: 'soon',
  quote: '就很……你懂吧。',
  intro:
    '2026 年互联网最忙的男人。黑卫衣、黑口罩、黑耳机，站上讲台就开始打碟。豪意值 = 又装又酷的含量，测测你离「隔壁班嘉豪」有多远。',
  traits: ['全黑三件套', 'The Spectre 打碟动作', '就很你懂吧', '教室白板投影'],
  note: '嘉豪模块正在打碟开发中，素材到位后上线。',
}

/** 流程三步 */
export const HOW_STEPS = [
  {
    no: '01',
    title: '看示范',
    desc: '先看一遍奶蛙示范动作，把关键动作记在心里。',
    icon: '📺',
  },
  {
    no: '02',
    title: '跟着做',
    desc: '打开摄像头，3 秒准备后跟做 15 秒。也可选择已有视频。',
    icon: '🎬',
  },
  {
    no: '03',
    title: '领称号',
    desc: '完整动作结束后，在本机比对，生成奶家人值和专属称号卡。',
    icon: '🏅',
  },
]

/** 四个评分子项 */
export const METRIC_META = {
  action: {
    key: 'action',
    label: '动作相似度',
    short: '动作',
    desc: '动作轮廓与结构与示范有多像',
    color: '#87D96B',
  },
  rhythm: {
    key: 'rhythm',
    label: '节奏同步',
    short: '节奏',
    desc: '卡点、速度与时长有没有跟上',
    color: '#FF9CB8',
  },
  energy: {
    key: 'energy',
    label: '奶量爆发',
    short: '能量',
    desc: '动作幅度和挥洒程度够不够大',
    color: '#FFD35C',
  },
  completion: {
    key: 'completion',
    label: '完成度',
    short: '完成',
    desc: '有没有把整段动作完整做完',
    color: '#8ED0FF',
  },
}

/** 静态姿势不使用节奏/爆发指标，结果与分享保持相同含义。 */
export const POSE_METRIC_META = {
  action: { ...METRIC_META.action, label:'姿势匹配', short:'姿势', desc:'手臂、手腕相对身体的位置与所选参考有多接近' },
  rhythm: { ...METRIC_META.rhythm, label:'保持稳定', short:'稳定', desc:'保持姿势时，手臂与手腕是否稳定' },
  energy: { ...METRIC_META.energy, label:'入镜清晰', short:'清晰', desc:'上半身关键点的可见程度与有效画面比例' },
  completion: { ...METRIC_META.completion, label:'保持完成度', desc:'保持时间中，姿势达到匹配要求的比例' },
}
export const metricMetaFor = result => result?.analysisMode==='pose' ? POSE_METRIC_META : METRIC_META

/** 首页排行榜预览 / 榜单种子数据（仅用于演示氛围，可自行替换） */
export const LEADERBOARD_SEED = [
  { id: 'seed-1', name: '奶蛙本蛙', score: 98.6, date: '2026-10-27' },
  { id: 'seed-2', name: '凌晨三点喝奶', score: 96.2, date: '2026-10-28' },
  { id: 'seed-3', name: '沙县小吃代言人', score: 93.1, date: '2026-10-26' },
  { id: 'seed-4', name: '奶使战神', score: 88.8, date: '2026-10-28' },
  { id: 'seed-5', name: '隔壁班嘉豪', score: 84.0, date: '2026-10-25' },
  { id: 'seed-6', name: '奶狗小霸王', score: 72.3, date: '2026-10-27' },
  { id: 'seed-7', name: '一只奶龙', score: 61.5, date: '2026-10-26' },
  { id: 'seed-8', name: '路过的奶家人', score: 42.0, date: '2026-10-24' },
]

/** 常见问题 */
export const FAQ = [
  {
    q: '这里的奶蛙是什么形象？',
    a: '奶蛙是黄色身体、绿色眼圈、浅色大肚子和深色手脚的网络二创生物。本页已内置捧腹大笑连续示范，其他姿势图片可展开参考。',
  },
  {
    q: '我的视频会被上传吗？',
    a: '不会。摄像头直接在内存中采样，不录制视频文件；已有视频也只在本机读取和比对。画面不上传、不保存，只将昵称、分数和称号等成绩信息保存在本机排行榜。',
  },
  {
    q: '摄像头打不开怎么办？',
    a: '先在浏览器地址栏允许摄像头，关闭可能占用镜头的应用；手机内置浏览器受限时可换系统浏览器。公网页面需要 HTTPS。不方便授权时，选择已有视频也能完成测试。',
  },
  {
    q: '会边做边判断姿势是否正确吗？',
    a: '连续动作模式显示取景、同步示范和进度，结束后比较运动轮廓与节奏。姿势挑战会在本机识别上半身关键点，提示与所选姿势的匹配程度，保持结束后综合给分；不提供专业动作指导。',
  },
  {
    q: '分数是怎么算出来的？',
    a: '从你的视频和示范视频里抽取动作帧，比对四件事：动作轮廓与结构（55%）、节奏同步（20%）、动作幅度（15%）、完整度（10%）。这是一套「动作结构比对」算法，不是专业人体姿态识别，也没有用到你的脸。',
  },
  {
    q: '为什么我觉得一模一样，却没拿满分？',
    a: '镜头角度、光线、背景、衣服颜色、视频压缩、动作起止时间都会影响比对结果；另外娱乐测评定分特意留了一点「进步空间」——满分是留给奶蛙本蛙的。',
  },
  {
    q: '奶使是什么称号？',
    a: '奶使是 0–34 分的入门称号，寓意刚刚降临奶界、快乐起飞。奶王、奶后、奶家人、奶狗、奶使都是娱乐称号，欢迎多试几次。',
  },
  {
    q: '可以反复测吗？',
    a: '可以，想测多少次测多少次。排行榜记录你最后一次的成绩，昵称可以每次换。',
  },
  {
    q: '嘉豪模块什么时候上线？',
    a: '嘉豪本豪还在隔壁班打碟，素材对接完成后就上。豪意值会比奶家人值更抽象，敬请期待。',
  },
  {
    q: '这个网站是官方吗？',
    a: '不是。本站是网友自制的网络热梗同人趣味企划，与任何品牌、艺人、学校无关，纯属娱乐，请勿当真。',
  },
]

/** 鉴定说明页的算法说明 */
export const ALGO_FACTS = [
  {
    title: '只看动作，不看脸',
    desc: '算法对画面做灰度化和前景提取，只关心动作轮廓与运动能量，不保存、不上传原视频。',
    icon: '🫥',
  },
  {
    title: '四维打分',
    desc: '动作相似度 55% + 节奏同步 20% + 奶量爆发 15% + 完成度 10%，加权后映射到 0–100 分。',
    icon: '🧮',
  },
  {
    title: '动态时间对齐',
    desc: '用 DTW 动态时间规整对齐两段动作，就算你比示范慢半拍，也能对齐到正确的位置再比较。',
    icon: '⏱️',
  },
  {
    title: '娱乐第一',
    desc: '这是一套轻量动作比对方案，不是专业测评工具。分数图一乐，奶家人身份才是真的。',
    icon: '🎈',
  },
]

export const STORAGE_KEYS = {
  settings: 'mlab.settings.v1',
  results: 'mlab.results.v1',
  nickname: 'mlab.nickname.v1',
  current: 'mlab.current-result.v1',
}

export const DEFAULT_NICKNAME = '匿名奶家人'
