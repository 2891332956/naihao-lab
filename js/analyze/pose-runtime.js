/** 浏览器本地姿态模型；所有脚本、WASM 与权重均从本站按需加载。 */
import { normalizePose, poseFramingMessage, POSE_TARGETS, summarizePose } from './pose-core.js'
import { sampleVideo } from './video-sampler.js'
import { createAnalysisResult } from './scoring.js'

export async function loadPoseEngine() {
  const { FilesetResolver, PoseLandmarker } = await import('../../assets/vendor/mediapipe/vision_bundle.mjs')
  const wasmBase = new URL('../../assets/vendor/mediapipe/',import.meta.url).href.replace(/\/$/,'')
  const wasm = await FilesetResolver.forVisionTasks(wasmBase)
  const detector = await PoseLandmarker.createFromOptions(wasm,{
    baseOptions:{
      modelAssetPath:new URL('../../assets/models/pose_landmarker_lite.task',import.meta.url).href,
      delegate:'CPU',
    },
    runningMode:'VIDEO',numPoses:1,
    minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5,
    outputSegmentationMasks:false,
  })
  let timestamp=0,closed=false
  return {
    readFrame(video,t,mirrored=false) {
      if(closed) throw new Error('姿势识别已关闭，请重新开始。')
      timestamp=Math.max(timestamp+1,performance.now())
      // 使用整个摄像头画面；镜像只变换坐标，不能裁掉两侧的手臂。
      const aspect=video.videoWidth/video.videoHeight
      const result=detector.detectForVideo(video,timestamp)
      const pose=normalizePose(result.landmarks[0],{aspect,mirrored})
      return {
        pose,t,framing:pose?'':poseFramingMessage(result.landmarks[0]),
      }
    },
    close(){if(!closed){closed=true;detector.close()}},
  }
}

export async function analyzePoseChallenge({reference,userSource,userSequence,engine,signal,onProgress}) {
  if(signal?.aborted) throw new DOMException('已取消','AbortError')
  const target=POSE_TARGETS[reference?.id]
  if(!target) throw new Error('没有选择有效的姿势。')
  onProgress?.({phase:'user',ratio:.1,detail:'正在读取你的姿势'})
  const user=userSequence || await sampleVideo(userSource,{
    fps:6,maxFrames:31,maxDuration:5,signal,
    frameReader:(video,t)=>engine.readFrame(video,t,false),
    onProgress:p=>onProgress?.({phase:'user',ratio:.1+p.progress*.65,detail:'正在比对所选姿势'}),
  })
  if(signal?.aborted) throw new DOMException('已取消','AbortError')
  const raw=summarizePose(user.frames,target,{duration:user.duration})
  const result=createAnalysisResult(raw,{frames:[target],duration:5},user,{
    analysisMode:'pose',challengeId:reference.id,challengeName:reference.name,
  })
  onProgress?.({phase:'done',ratio:1,detail:'姿势鉴定完成'})
  return result
}

