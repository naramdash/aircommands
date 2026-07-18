import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import ModelAssetPath from '../assets/hand_landmarker.task?url'

const wasmRoot = new URL('./mediapipe/tasks-vision/wasm', window.location.href).toString()
const vision = await FilesetResolver.forVisionTasks(wasmRoot)

const handLandmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: ModelAssetPath },
  runningMode: 'VIDEO',
  numHands: 2,
})

export { vision, handLandmarker }
