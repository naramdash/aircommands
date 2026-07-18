import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import ModelAssetPath from '../assets/hand_landmarker.task?url'

const vision = await FilesetResolver.forVisionTasks('/mediapipe/tasks-vision/wasm')

const handLandmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: ModelAssetPath },
  runningMode: 'VIDEO',
  numHands: 2,
})

export { vision, handLandmarker }
