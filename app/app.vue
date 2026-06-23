<script setup lang="ts">
import { HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { handLandmarker } from './utils/hand_landmark_detection'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const errorMessage = ref('')
const isCameraActive = ref(false)

let mediaStream: MediaStream | null = null
let animationFrameId = 0

async function startCamera() {
  errorMessage.value = ''

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    const video = videoRef.value
    if (!video) return

    video.srcObject = mediaStream
    await video.play()

    isCameraActive.value = true
    drawLandmarkFrame()
  } catch (error) {
    stopCamera()
    errorMessage.value =
      error instanceof Error ? error.message : 'Camera permission was denied.'
  }
}

function stopCamera() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
  }

  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
  isCameraActive.value = false

  const video = videoRef.value
  if (video) {
    video.pause()
    video.srcObject = null
  }
}

function drawLandmarkFrame() {
  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')

  if (!video || !canvas || !context) return

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    context.clearRect(0, 0, canvas.width, canvas.height)

    const result = handLandmarker.detectForVideo(video, performance.now())
    drawHandLandmarks(context, result.landmarks, canvas.width, canvas.height)
  }

  animationFrameId = requestAnimationFrame(drawLandmarkFrame)
}

function drawHandLandmarks(
  context: CanvasRenderingContext2D,
  hands: NormalizedLandmark[][],
  width: number,
  height: number,
) {
  context.lineWidth = 4
  context.strokeStyle = '#14b8a6'
  context.fillStyle = '#f97316'

  for (const landmarks of hands) {
    for (const connection of HandLandmarker.HAND_CONNECTIONS) {
      const from = landmarks[connection.start]
      const to = landmarks[connection.end]

      if (!from || !to) continue

      const [fromX, fromY] = landmarkToCanvasPoint(from, width, height)
      const [toX, toY] = landmarkToCanvasPoint(to, width, height)

      context.beginPath()
      context.moveTo(fromX, fromY)
      context.lineTo(toX, toY)
      context.stroke()
    }

    for (const landmark of landmarks) {
      const [x, y] = landmarkToCanvasPoint(landmark, width, height)

      context.beginPath()
      context.arc(x, y, 6, 0, Math.PI * 2)
      context.fill()
    }
  }
}

function landmarkToCanvasPoint(
  landmark: NormalizedLandmark,
  width: number,
  height: number,
) {
  return [(1 - landmark.x) * width, landmark.y * height] as const
}

onMounted(() => {
  void startCamera()
})

onBeforeUnmount(() => {
  stopCamera()
})
</script>

<template>
  <main class="camera-view">
    <div class="camera-surface">
      <video ref="videoRef" muted playsinline class="camera-video" />
      <canvas ref="canvasRef" class="camera-canvas" />
    </div>

    <div class="camera-controls">
      <button v-if="!isCameraActive" type="button" @click="startCamera">
        Start
      </button>
      <button v-else type="button" @click="stopCamera">
        Stop
      </button>
      <p v-if="errorMessage" class="camera-error">{{ errorMessage }}</p>
    </div>
  </main>
</template>

<style scoped>
.camera-view {
  min-height: 100svh;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 24px;
  box-sizing: border-box;
}

.camera-surface {
  position: relative;
  width: min(100%, 960px);
  aspect-ratio: 16 / 9;
  align-self: center;
  justify-self: center;
  overflow: hidden;
  background: #111;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.camera-video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transform: scaleX(-1);
}

.camera-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.camera-controls {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

button {
  min-width: 88px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-h);
  background: var(--social-bg);
  font: 600 15px/1 var(--sans);
  cursor: pointer;
}

button:hover {
  box-shadow: var(--shadow);
}

button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.camera-error {
  max-width: min(100%, 640px);
  color: #c2410c;
  font-size: 14px;
}

@media (max-width: 720px) {
  .camera-view {
    padding: 12px;
  }

  .camera-surface {
    border-radius: 6px;
  }
}
</style>
