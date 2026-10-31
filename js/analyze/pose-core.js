/** 静态上半身姿势模板。位置按双肩宽度/躯干长度归一化，不使用角色像素或面部表情评分。 */
export const POSE_TARGETS = {
  belly: { id:'belly', leftElbow:[-.85,-.4], leftWrist:[-.12,-.3], rightElbow:[.85,-.4], rightWrist:[.12,-.3] },
  wave: { id:'wave', leftElbow:[-.8,-.4], leftWrist:[-.12,-.5], rightElbow:[1,-1], rightWrist:[1.4,-1.25] },
  mirror: { id:'mirror', leftElbow:[-1,-1], leftWrist:[-1.4,-1.25], rightElbow:[.8,-.4], rightWrist:[.12,-.5] },
  fold: { id:'fold', leftElbow:[-.75,-.45], leftWrist:[.3,-.7], rightElbow:[.75,-.45], rightWrist:[-.3,-.7] },
  think: { id:'think', leftElbow:[-.9,-.75], leftWrist:[-.45,-1.6], rightElbow:[.8,-.3], rightWrist:[-.2,-.35] },
}
const joints=['leftElbow','leftWrist','rightElbow','rightWrist']
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v))
const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length)
const round=v=>Math.round(v*10)/10

export function normalizePose(landmarks, { aspect=1, mirrored=false }={}) {
  const ids=[11,12,13,14,15,16,23,24]
  if (!ids.every(i=>{
    const p=landmarks?.[i]
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      p.x>=-.05 && p.x<=1.05 && p.y>=-.05 && p.y<=1.05 &&
      (p.visibility??0)>=.55 && (p.presence??1)>=.55
  })) return null
  const p=i=>({x:(mirrored?1-landmarks[i].x:landmarks[i].x)*aspect,y:landmarks[i].y})
  const a=p(11),b=p(12),h1=p(23),h2=p(24)
  const hip={x:(h1.x+h2.x)/2,y:(h1.y+h2.y)/2}
  const shoulder={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
  const width=Math.abs(a.x-b.x),height=hip.y-shoulder.y
  if(width<.06*aspect || height<.08) return null
  const left=a.x<b.x?11:12,right=left===11?12:11
  const point=i=>{const q=p(i);return [(q.x-hip.x)/width,(q.y-hip.y)/height]}
  return {
    leftElbow:point(left+2),leftWrist:point(left+4),
    rightElbow:point(right+2),rightWrist:point(right+4),
    quality:mean(ids.map(i=>Math.min(landmarks[i].visibility,landmarks[i].presence??1))),
  }
}
export function scorePose(pose,target) {
  if(!pose || !target) return 0
  let error=0
  for(const name of joints) {
    const wrist=name.endsWith('Wrist'),tolerance=wrist?.32:.5,weight=wrist?.35:.15
    const dx=pose[name][0]-target[name][0],dy=pose[name][1]-target[name][1]
    error+=weight*(dx*dx+dy*dy)/(tolerance*tolerance)
  }
  return round(clamp(100*Math.exp(-.7*error)))
}
export function summarizePose(frames,target,{duration=5}={}) {
  if(duration<3) throw new Error('姿势挑战的视频至少 3 秒，建议保持 5 秒。')
  const visible=frames.filter(f=>f.pose)
  if(visible.length<6 || visible.length/Math.max(1,frames.length)<.6) {
    throw new Error('没有持续看清上半身，请让双肩、双手和髋部完整入镜后重试。')
  }
  const scores=visible.map(f=>scorePose(f.pose,target))
  const motion=[]
  for(let i=1;i<visible.length;i++) {
    motion.push(mean(joints.map(name=>Math.hypot(
      visible[i].pose[name][0]-visible[i-1].pose[name][0],
      visible[i].pose[name][1]-visible[i-1].pose[name][1],
    ))))
  }
  const action=mean(scores)
  const stability=100*Math.exp(-5*mean(motion))
  const clarity=100*mean(visible.map(f=>f.pose.quality))*visible.length/frames.length
  const completion=100*scores.filter(s=>s>=65).length/frames.length
  const score=clamp((action*.65+stability*.2+completion*.15)*Math.min(1,clarity/80))
  return {
    score:round(score),
    metrics:{action:round(action),rhythm:round(stability),energy:round(clarity),completion:round(completion)},
    confidence:round(clarity)/100,
    debug:{visibleFrames:visible.length,totalFrames:frames.length,targetId:target.id},
    version:'pose-1.0',
  }
}

