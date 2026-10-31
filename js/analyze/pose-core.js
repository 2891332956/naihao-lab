/** 静态上半身姿势模板。位置按双肩宽度/躯干长度归一化，不使用角色像素或面部表情评分。 */
export const POSE_TARGETS = {
  belly: { id:'belly', leftElbow:[-.85,-.4], leftWrist:[-.12,-.3], rightElbow:[.85,-.4], rightWrist:[.12,-.3] },
  wave: { id:'wave', leftElbow:[-.8,-.4], leftWrist:[-.12,-.5], rightElbow:[1,-1], rightWrist:[1.4,-1.25] },
  mirror: { id:'mirror', leftElbow:[-1,-1], leftWrist:[-1.4,-1.25], rightElbow:[.8,-.4], rightWrist:[.12,-.5] },
  fold: { id:'fold', leftElbow:[-.75,-.45], leftWrist:[.3,-.7], rightElbow:[.75,-.45], rightWrist:[-.3,-.7] },
  think: { id:'think', leftElbow:[-.9,-.75], leftWrist:[-.45,-1.6], rightElbow:[.8,-.3], rightWrist:[-.2,-.35] },
}
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v))
const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length)
const round=v=>Math.round(v*10)/10
const visible=(landmarks,i)=>{
  const p=landmarks?.[i]
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x>=-.05 && p.x<=1.05 && p.y>=-.05 && p.y<=1.05 &&
    (p.visibility??0)>=.55 && (p.presence??1)>=.55
}

export function poseFramingMessage() { return '暂未看清动作，可以直接开始；请让做动作的手臂尽量入镜。' }

export function normalizePose(landmarks, { aspect=1, mirrored=false }={}) {
  const ids=[11,12,13,14,15,16].filter(i=>visible(landmarks,i))
  const shoulders=ids.filter(i=>i===11||i===12)
  if (!shoulders.length || !ids.some(i=>i>=13)) return null
  const p=i=>({x:(mirrored?1-landmarks[i].x:landmarks[i].x)*aspect,y:landmarks[i].y})
  // 单肩时不能用被遮挡肩的无效坐标排序；采用正面人体的模型解剖 ID 与镜像映射。
  const left=shoulders.length===2?(p(11).x<p(12).x?11:12):(mirrored?11:12),right=left===11?12:11
  const anchor=p(shoulders[0])
  const width=shoulders.length===2?Math.max(.06*aspect,Math.abs(p(11).x-p(12).x)):.25*aspect
  const center=shoulders.length===2?{x:(p(11).x+p(12).x)/2,y:(p(11).y+p(12).y)/2}:anchor
  const point=i=>{if(!visible(landmarks,i))return null;const q=p(i);return [(q.x-center.x)/width,(q.y-center.y)/(width*1.25)-1]}
  return {
    leftShoulder:point(left),rightShoulder:point(right),
    leftElbow:point(left+2),leftWrist:point(left+4),
    rightElbow:point(right+2),rightWrist:point(right+4),
    quality:mean(ids.map(i=>Math.min(landmarks[i].visibility,landmarks[i].presence??1))),
  }
}

const partNames={leftShoulder:'左肩',rightShoulder:'右肩',leftElbow:'左肘',rightElbow:'右肘',leftWrist:'左手',rightWrist:'右手'}
const armWeights={wave:[.2,.8],mirror:[.8,.2],think:[.85,.15],belly:[.5,.5],fold:[.5,.5]}
function vector(a,b){if(!a||!b)return null;const x=b[0]-a[0],y=(b[1]-a[1])*1.25,l=Math.hypot(x,y);return l>.001?[x/l,y/l]:null}
function arm(pose,side){
  const shoulder=Object.hasOwn(pose,side+'Shoulder')?pose[side+'Shoulder']:[side==='left'?-.5:.5,-1]
  const elbow=pose[side+'Elbow'],wrist=pose[side+'Wrist']
  return {upper:vector(shoulder,elbow),fore:vector(elbow,wrist),reach:vector(shoulder,wrist)}
}
const angular=(a,b)=>Math.exp(-1.8*(Math.acos(clamp(a[0]*b[0]+a[1]*b[1],-1,1))/.8)**2)

/** 只比较可观测手臂的方向/弯曲，不比较手臂长度、身体轮廓或像素。 */
export function assessPose(pose,target){
  const missing=Object.keys(partNames).filter(key=>!pose?.[key] && (Object.hasOwn(pose||{},key)||!key.endsWith('Shoulder'))).map(key=>partNames[key])
  if(!pose||!target)return {assessable:false,score:null,coverage:0,missing,message:'暂未看清动作，请调整光线或做动作的手臂。'}
  const sides=['left','right'],observations=sides.map(side=>arm(pose,side)),targets=sides.map(side=>arm(target,side))
  const focus=target.id==='wave'?1:['mirror','think'].includes(target.id)?0:null
  const observed=observations.map(a=>Boolean(a.reach || (a.upper&&a.fore)))
  if((focus!==null&&!observed[focus]) || !observed.some(Boolean)){
    return {assessable:false,score:null,coverage:0,missing,message:focus!==null?`请尽量露出${focus===0?'左侧':'右侧'}抬起的手臂；另一只手可以遮挡。`:'请尽量露出一侧做动作的手臂；不用同时露出双手。'}
  }
  let total=0,weight=0,coverage=0
  const weights=armWeights[target.id]||[.5,.5]
  sides.forEach((side,i)=>{
    const a=observations[i],b=targets[i]
    const features=a.upper&&a.fore?[[a.upper,b.upper,.3],[a.fore,b.fore,.7]]:a.reach?[[a.reach,b.reach,1]]:[]
    if(!features.length)return
    total+=weights[i]*features.reduce((sum,[u,v,w])=>sum+angular(u,v)*w,0)
    weight+=weights[i]
    coverage+=weights[i]*(a.upper&&a.fore?1:.6)
  })
  return {assessable:true,score:round(100*total/weight),coverage,missing,
    observed:Object.keys(partNames).filter(key=>pose[key]).map(key=>partNames[key]),
    message:missing.length?'可以测试，遮挡部位会标为未评估。':'动作已看清，可以开始。'}
}
export const scorePose=(pose,target)=>assessPose(pose,target).score??0

export function summarizePose(frames,target,{duration=5}={}) {
  if(duration<3) throw new Error('姿势挑战的视频至少 3 秒，建议保持 5 秒。')
  const evaluated=frames.map(f=>({...f,assessment:assessPose(f.pose,target)}))
  const visible=evaluated.filter(f=>f.assessment.assessable)
  if(visible.length<6 || visible.length/Math.max(1,frames.length)<.25) {
    throw new Error('可评估的动作画面不足，请让做动作的一侧手臂入镜后重试；不用同时露出双手双肩。')
  }
  const scores=visible.map(f=>scorePose(f.pose,target))
  const motion=[]
  for(let i=1;i<visible.length;i++) {
    const changes=[]
    for(const side of ['left','right']){
      const a=arm(visible[i].pose,side),b=arm(visible[i-1].pose,side)
      for(const key of ['upper','fore'])if(a[key]&&b[key])changes.push(Math.acos(clamp(a[key][0]*b[key][0]+a[key][1]*b[key][1],-1,1)))
    }
    motion.push(mean(changes))
  }
  const action=mean(scores)
  const stability=100*Math.exp(-5*mean(motion))
  const coverage=mean(visible.map(f=>f.assessment.coverage))*visible.length/frames.length
  const clarity=mean(visible.map(f=>f.pose.quality))*coverage
  const completion=100*scores.filter(s=>s>=65).length/visible.length
  const score=clamp(action*.9+stability*.05+completion*.05)
  const observed=Object.values(partNames).filter(name=>visible.filter(f=>f.assessment.observed.includes(name)).length/visible.length>=.5)
  return {
    score:round(score),
    metrics:{action:round(action),rhythm:round(stability),energy:round(coverage*100),completion:round(completion)},
    confidence:Math.round(clarity*100)/100,
    assessment:{observed,missing:Object.values(partNames).filter(name=>!observed.includes(name)),coverage:round(coverage*100)},
    debug:{visibleFrames:visible.length,totalFrames:frames.length,targetId:target.id,appearanceWeight:0},
    version:'pose-2.0',
  }
}

