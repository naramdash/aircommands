// https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import ModelAssetPath from '../assets/hand_landmarker.task?url';

const vision = await FilesetResolver.forVisionTasks( 
  // path/to/wasm/root
  '/mediapipe/tasks-vision/wasm' 
);

// const vision = await FilesetResolver.forVisionTasks( 
//   // path/to/wasm/root
//  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
// );

const handLandmarker = await HandLandmarker.createFromOptions( vision, 
  { 
    baseOptions: { modelAssetPath: ModelAssetPath }, 
    runningMode: 'VIDEO',
    numHands: 1 
  });

export { vision, handLandmarker };
