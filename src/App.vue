<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ApplicationPickerDialog from './components/ApplicationPickerDialog.vue'
import GestureHoldDialog from './components/GestureHoldDialog.vue'
import {
  oneHandTouchGestureCommands,
  touchGestureCommands,
} from './utils/gesture_command_detection/command_map'
import {
  createRecognitionContext,
  reduceRecognitionFrame,
  TOUCH_HOLD_MS,
} from './utils/gesture_command_detection/recognition_reducer'
import { getTouchFrame } from './utils/gesture_command_detection/touch_detection'
import type {
  FingerName,
  FingerTip,
  GestureCandidate,
  GestureName,
  RecognitionState,
  TouchContact,
  TouchFrame,
} from './utils/gesture_command_detection/types'
import googleIconUrl from './assets/google.svg'
import { handLandmarker } from './utils/hand_landmark_detection'
import { formatInputSequence } from './utils/input_sequence'
import { getWindowsCommandOption } from './utils/windows_command'

const FINGER_RADIUS = 5
const ACTIVE_FINGER_RADIUS = 8
const TOUCH_COLOR = '250, 204, 21'
const TOUCH_SUCCESS_COLOR = '34, 197, 94'
const TOUCH_SUCCESS_HIGHLIGHT_MS = 900
const EXECUTION_REQUEST_TIMEOUT_MS = 2500

const FINGER_COLORS: Record<FingerName, string> = {
  thumb: '239, 68, 68',
  index: '34, 197, 94',
  middle: '59, 130, 246',
  ring: '168, 85, 247',
  pinky: '45, 212, 191',
}

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const errorMessage = ref('')
const isCameraActive = ref(false)
const isLeftHandVisible = ref(false)
const isRightHandVisible = ref(false)
const recognitionState = ref<RecognitionState>('tracking')
const currentCandidateLabel = ref('없음')
const currentTouchLabel = ref('없음')
const currentTouchGesture = ref<GestureName | ''>('')
const poseWarning = ref('')
const modifierWarning = ref('')
const isControlLeftPressed = ref(false)
const isControlRightPressed = ref(false)
const touchProgressPercent = ref(0)
const touchDistanceText = ref('없음')
const cooldownRemainingMs = ref(0)
const commandResultMessage = ref('')
const gestureCompletionNotice = ref('')
const settings = ref<UserSettingsView | null>(null)
const applicationPickerGesture = ref<GestureName | null>(null)
const isGestureHoldDialogOpen = ref(false)
const isClearingAssignments = ref(false)
const isEditingCommands = computed(() =>
  Boolean(applicationPickerGesture.value) ||
  isGestureHoldDialogOpen.value)
const gestureHoldMs = computed(() => settings.value?.gestureHoldMs ?? TOUCH_HOLD_MS)
const hasGestureAssignments = computed(() =>
  Object.keys(settings.value?.gestureAssignments ?? {}).some((gesture) =>
    settings.value?.gestureAssignments[gesture] !== null ||
    settings.value?.inputSequenceAssignments[gesture] !== null ||
    settings.value?.windowsCommandAssignments[gesture] !== null))
const isRecognitionOnHold = computed(() => Boolean(poseWarning.value))
const oneHandGestureGroups = computed(() => [
  {
    hand: 'Left' as const,
    label: '왼손',
    shapeLabel: '네모',
    commands: oneHandTouchGestureCommands.filter((command) => command.hand === 'Left'),
  },
  {
    hand: 'Right' as const,
    label: '오른손',
    shapeLabel: '세모',
    commands: oneHandTouchGestureCommands.filter((command) => command.hand === 'Right'),
  },
])

const activeTouchCommand = computed(() => {
  if (!currentTouchGesture.value) return null
  return touchGestureCommands.find((command) => command.gesture === currentTouchGesture.value) ?? null
})

const activeTouchApplication = computed(() => {
  if (!activeTouchCommand.value) return null
  return getApplicationForGesture(activeTouchCommand.value.gesture)
})

const activeTouchApplicationLabel = computed(() => {
  if (!activeTouchCommand.value) return ''
  return getGestureApplicationLabel(activeTouchCommand.value.gesture)
})

const activeTouchApplicationIconDataUrl = computed(() => {
  if (!activeTouchCommand.value) return undefined
  return getGestureApplicationIconDataUrl(activeTouchCommand.value.gesture)
})

const activeTouchApplicationIcon = computed(() => {
  if (!activeTouchCommand.value) return '➖'
  return getGestureApplicationIcon(activeTouchCommand.value.gesture)
})

const cooldownSeconds = computed(() => Math.ceil(cooldownRemainingMs.value / 1000))

const trackingStatus = computed(() => {
  if (isEditingCommands.value) return '제스처 동작 설정 중'
  if (!isCameraActive.value) return '카메라 대기'
  if (recognitionState.value === 'executing') return '실행 중'
  if (recognitionState.value === 'cooldown') return '쿨다운'
  if (recognitionState.value === 'error') return '오류'
  if (!isLeftHandVisible.value && !isRightHandVisible.value) return '손 대기'
  if (poseWarning.value) return '자세 보류'
  if (recognitionState.value === 'touching') return '접촉 감지'
  if (isLeftHandVisible.value && !isRightHandVisible.value) return '왼손 감지'
  if (!isLeftHandVisible.value && isRightHandVisible.value) return '오른손 감지'
  return '접촉 대기'
})

const phaseGuideText = computed(() => {
  if (isEditingCommands.value) return '제스처 동작 설정 중에는 실행이 일시 정지됩니다'
  if (!isCameraActive.value) return '카메라를 시작하세요'
  if (!isLeftHandVisible.value && !isRightHandVisible.value) return '손을 화면에 보여주세요'
  if (poseWarning.value) return poseWarning.value
  if (modifierWarning.value) return modifierWarning.value
  if (recognitionState.value === 'touching') return '손가락 접촉을 잠깐 유지하면 명령이 실행됩니다'
  if (recognitionState.value === 'executing') return '명령 실행 중입니다'
  if (recognitionState.value === 'cooldown') return '다음 입력을 잠시 대기합니다'
  if (recognitionState.value === 'error') return '오류 상태입니다'
  return '한 손에서 엄지와 검지·중지·약지 중 하나를 맞대세요'
})

function handleKeyDown(event: KeyboardEvent) {
  if (event.code === 'ControlLeft') {
    isControlLeftPressed.value = true
  } else if (event.code === 'ControlRight') {
    isControlRightPressed.value = true
  }
}

function handleKeyUp(event: KeyboardEvent) {
  if (event.code === 'ControlLeft') {
    isControlLeftPressed.value = false
  } else if (event.code === 'ControlRight') {
    isControlRightPressed.value = false
  }
}

function handleWindowBlur() {
  isControlLeftPressed.value = false
  isControlRightPressed.value = false
}

function getGestureModifier(gesture: GestureName) {
  return settings.value?.gestureModifierAssignments[gesture] ?? 'none'
}

function isGestureModifierSatisfied(gesture: GestureName) {
  const modifier = getGestureModifier(gesture)
  if (modifier === 'control_left') return isControlLeftPressed.value
  if (modifier === 'control_right') return isControlRightPressed.value
  return true
}

function getGestureModifierBadge(gesture: GestureName) {
  const modifier = getGestureModifier(gesture)
  if (modifier === 'control_left') return 'L-Ctrl'
  if (modifier === 'control_right') return 'R-Ctrl'
  return ''
}

function getFingerColor(finger: FingerName) {
  return `rgb(${FINGER_COLORS[finger]})`
}

function getApplicationForGesture(gesture: GestureName) {
  const applicationId = settings.value?.gestureAssignments[gesture]
  if (!applicationId) return null
  return settings.value?.applications.find((application) => application.id === applicationId) ?? null
}

function getInputSequenceForGesture(gesture: GestureName) {
  return settings.value?.inputSequenceAssignments[gesture] ?? null
}

function getWindowsCommandForGesture(gesture: GestureName) {
  return settings.value?.windowsCommandAssignments[gesture] ?? null
}

function getGestureApplicationLabel(gesture: GestureName) {
  const inputSequence = getInputSequenceForGesture(gesture)
  if (inputSequence) return formatInputSequence(inputSequence)
  const windowsCommand = getWindowsCommandOption(getWindowsCommandForGesture(gesture))
  if (windowsCommand) return windowsCommand.label
  return getApplicationForGesture(gesture)?.name ?? '미지정'
}

function getGestureApplicationIcon(gesture: GestureName) {
  if (getInputSequenceForGesture(gesture)) return '⌨️'
  const windowsCommand = getWindowsCommandOption(getWindowsCommandForGesture(gesture))
  if (windowsCommand) return windowsCommand.icon
  return getApplicationForGesture(gesture)?.iconText ?? '➖'
}

function getGestureApplicationIconDataUrl(gesture: GestureName) {
  if (getInputSequenceForGesture(gesture) || getWindowsCommandForGesture(gesture)) return undefined
  const app = getApplicationForGesture(gesture)
  if (app?.id === 'builtin:google-login' || (app?.targetKind === 'builtin' && app?.targetLabel === 'google-login')) {
    return googleIconUrl
  }
  return app?.iconDataUrl
}

function updateSettings(nextSettings: UserSettingsView) {
  const currentIcons = new Map(
    settings.value?.applications.flatMap((application) =>
      application.iconDataUrl ? [[application.id, application.iconDataUrl] as const] : []) ?? [],
  )
  settings.value = {
    ...nextSettings,
    applications: nextSettings.applications.map((application) => ({
      ...application,
      iconDataUrl: application.iconDataUrl ?? currentIcons.get(application.id),
    })),
  }
}

async function openApplicationPicker(gesture: GestureName) {
  if (!settings.value) {
    await loadSettings()
  }
  if (!settings.value) {
    errorMessage.value = '설정을 불러오는 중입니다. 잠시 후 다시 시도하세요.'
    return
  }
  applicationPickerGesture.value = gesture
}

function handleSettingsStatus(message: string, isError: boolean) {
  if (isError) {
    errorMessage.value = message
    commandResultMessage.value = ''
  } else {
    commandResultMessage.value = message
    errorMessage.value = ''
  }
}

async function clearAllGestureAssignments() {
  isClearingAssignments.value = true
  try {
    const response = await window.aircommands.clearGestureAssignments()
    if (!response.success) {
      handleSettingsStatus(response.message, true)
      return
    }
    if (response.canceled) return
    if (response.settings) updateSettings(response.settings)
    handleSettingsStatus(
      response.clearedAssignments
        ? `제스처 배정 ${response.clearedAssignments}개를 모두 비웠습니다.`
        : '비울 제스처 배정이 없습니다.',
      false,
    )
  } catch (error) {
    handleSettingsStatus(
      error instanceof Error ? error.message : '제스처 배정을 비우지 못했습니다.',
      true,
    )
  } finally {
    isClearingAssignments.value = false
  }
}

async function loadSettings() {
  try {
    const response = await window.aircommands.getSettings()
    if (!response.success) {
      errorMessage.value = response.message
      return
    }

    settings.value = response.settings
    if (response.settings.recoveryNotice) {
      errorMessage.value = response.settings.recoveryNotice
    }
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '프로그램 설정을 불러오지 못했습니다.'
  }
}

let mediaStream: MediaStream | null = null
let animationFrameId = 0
let recognitionContext = createRecognitionContext()
let gestureCompletionTimer: ReturnType<typeof setTimeout> | null = null
let successfulTouchContact: TouchContact | null = null
let successfulTouchUntil = 0
let removeCatalogListener: (() => void) | null = null

async function startCamera() {
  errorMessage.value = ''
  commandResultMessage.value = ''

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
    drawCameraFrame()
  } catch (error) {
    stopCamera()
    errorMessage.value = error instanceof Error ? error.message : '카메라 권한을 확인할 수 없습니다.'
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
  resetRecognition()
  clearGestureCompletionNotice()

  const video = videoRef.value
  if (video) {
    video.pause()
    video.srcObject = null
  }

  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
}

function drawCameraFrame() {
  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (!video || !canvas || !context) return

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    syncCanvasSize(canvas, video)

    const now = performance.now()
    const result = handLandmarker.detectForVideo(video, now)
    const rawTouchFrame = getTouchFrame(result.landmarks, result.handednesses, now)
    let touchFrame = rawTouchFrame

    if (
      rawTouchFrame.closestContact &&
      !isGestureModifierSatisfied(rawTouchFrame.closestContact.gesture)
    ) {
      const requiredModifier = getGestureModifier(rawTouchFrame.closestContact.gesture)
      const keyLabel = requiredModifier === 'control_left' ? '왼쪽 Ctrl (ControlLeft)' : '오른쪽 Ctrl (ControlRight)'
      modifierWarning.value = `${keyLabel} 키를 누른 상태에서 제스처를 취하세요`
      touchFrame = {
        ...rawTouchFrame,
        closestContact: null,
      }
    } else {
      modifierWarning.value = ''
    }

    const recognitionResult = reduceRecognitionFrame(
      recognitionContext,
      touchFrame,
      now,
      gestureHoldMs.value,
    )

    const activeContact = recognitionResult.context.activeTouch ?? touchFrame.closestContact
    const successContact = getSuccessTouchContact(recognitionResult.executionCandidate ? activeContact : null, now)
    const displayedContact = successContact ?? activeContact

    context.clearRect(0, 0, canvas.width, canvas.height)
    drawTouchContact(
      context,
      canvas.width,
      canvas.height,
      displayedContact,
      successContact ? 1 : recognitionResult.context.touchProgress,
      Boolean(successContact),
    )
    drawFingerTips(context, canvas.width, canvas.height, touchFrame, activeContact, successContact)

    recognitionContext = recognitionResult.context
    syncRecognitionDisplay(touchFrame, now)

    if (recognitionResult.executionCandidate && !isEditingCommands.value) {
      showGestureCompletionNotice(recognitionResult.executionCandidate)
      void executeCandidate(recognitionResult.executionCandidate)
    }
  }

  animationFrameId = requestAnimationFrame(drawCameraFrame)
}

function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) return
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
}

function getSuccessTouchContact(contact: TouchContact | null, now: number) {
  if (contact) {
    successfulTouchContact = contact
    successfulTouchUntil = now + TOUCH_SUCCESS_HIGHLIGHT_MS
    return contact
  }

  if (successfulTouchContact && successfulTouchUntil > now) return successfulTouchContact
  successfulTouchContact = null
  successfulTouchUntil = 0
  return null
}

function drawFingerTips(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: TouchFrame,
  activeContact: TouchContact | null,
  successContact: TouchContact | null,
) {
  context.save()
  for (const tip of frame.leftTips) drawFingerTip(context, tip, 'left', width, height, activeContact, successContact)
  for (const tip of frame.rightTips) drawFingerTip(context, tip, 'right', width, height, activeContact, successContact)
  context.restore()
}

function drawFingerTip(
  context: CanvasRenderingContext2D,
  tip: FingerTip,
  hand: 'left' | 'right',
  width: number,
  height: number,
  activeContact: TouchContact | null,
  successContact: TouchContact | null,
) {
  const x = tip.point.x * width
  const y = tip.point.y * height
  const isActive =
    activeContact?.hand === (hand === 'left' ? 'Left' : 'Right') &&
    (activeContact.primaryFinger === tip.finger || activeContact.secondaryFinger === tip.finger)
  const isSuccess =
    successContact?.hand === (hand === 'left' ? 'Left' : 'Right') &&
    (successContact.primaryFinger === tip.finger || successContact.secondaryFinger === tip.finger)
  const radius = isActive || isSuccess ? ACTIVE_FINGER_RADIUS : FINGER_RADIUS
  const color = FINGER_COLORS[tip.finger]

  if (isActive || isSuccess) {
    const highlightColor = isSuccess ? TOUCH_SUCCESS_COLOR : TOUCH_COLOR
    context.save()
    context.shadowColor = `rgba(${highlightColor}, 0.6)`
    context.shadowBlur = isSuccess ? 14 : 10
    context.strokeStyle = `rgba(${highlightColor}, 1)`
    context.lineWidth = isSuccess ? 5 : 4
    context.beginPath()
    context.arc(x, y, radius + (isSuccess ? 9 : 7), 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }

  context.save()
  context.shadowColor = `rgba(${color}, 0.35)`
  context.shadowBlur = isActive ? 8 : 4
  context.fillStyle = `rgba(${color}, 0.94)`
  context.strokeStyle = 'rgba(15, 23, 42, 0.9)'
  context.lineWidth = 3
  if (hand === 'left') drawSquareTip(context, x, y, radius)
  else drawTriangleTip(context, x, y, radius)
  context.fill()
  context.stroke()
  context.restore()
}

function drawSquareTip(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const size = radius * 2.3
  context.beginPath()
  context.rect(x - size / 2, y - size / 2, size, size)
}

function drawTriangleTip(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const size = radius * 2.8
  const half = size / 2
  const verticalOffset = size * 0.08
  context.beginPath()
  context.moveTo(x, y - half - verticalOffset)
  context.lineTo(x + half, y + half - verticalOffset)
  context.lineTo(x - half, y + half - verticalOffset)
  context.closePath()
}

function drawTouchContact(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  contact: TouchContact | null,
  progress: number,
  isSuccess: boolean,
) {
  if (!contact) return

  const primaryX = contact.primaryPoint.x * width
  const primaryY = contact.primaryPoint.y * height
  const secondaryX = contact.secondaryPoint.x * width
  const secondaryY = contact.secondaryPoint.y * height
  const centerX = contact.midpoint.x * width
  const centerY = contact.midpoint.y * height
  const ringRadius = 17
  const touchColor = isSuccess ? TOUCH_SUCCESS_COLOR : TOUCH_COLOR

  context.save()
  context.lineCap = 'round'
  context.shadowColor = `rgba(${touchColor}, ${isSuccess ? 0.6 : 0.45})`
  context.shadowBlur = isSuccess ? 12 : 8
  context.strokeStyle = `rgba(${touchColor}, 0.96)`
  context.lineWidth = isSuccess ? 5 : 4
  context.setLineDash([])
  context.beginPath()
  context.moveTo(primaryX, primaryY)
  context.lineTo(secondaryX, secondaryY)
  context.stroke()

  // Add a subtle dashed guide to make contact lines easier to see in dim backgrounds.
  context.strokeStyle = `rgba(${touchColor}, ${isSuccess ? 0.65 : 0.5})`
  context.lineWidth = 2
  context.setLineDash([6, 4])
  context.beginPath()
  context.moveTo(primaryX, primaryY)
  context.lineTo(secondaryX, secondaryY)
  context.stroke()
  context.setLineDash([])

  context.strokeStyle = `rgba(${touchColor}, ${isSuccess ? 0.4 : 0.28})`
  context.lineWidth = 3
  context.beginPath()
  context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = `rgba(${touchColor}, 1)`
  context.beginPath()
  context.arc(centerX, centerY, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
  context.stroke()
  context.restore()
}

function resetRecognition() {
  recognitionContext = createRecognitionContext()
  successfulTouchContact = null
  successfulTouchUntil = 0
  isLeftHandVisible.value = false
  isRightHandVisible.value = false
  recognitionState.value = recognitionContext.state
  currentCandidateLabel.value = '없음'
  currentTouchLabel.value = '없음'
  currentTouchGesture.value = ''
  poseWarning.value = ''
  touchProgressPercent.value = 0
  touchDistanceText.value = '없음'
  cooldownRemainingMs.value = 0
  commandResultMessage.value = ''
  clearGestureCompletionNotice()
}

function syncRecognitionDisplay(frame: TouchFrame, now: number) {
  isLeftHandVisible.value = frame.leftHandVisible
  isRightHandVisible.value = frame.rightHandVisible
  poseWarning.value = getPoseWarning(frame)
  recognitionState.value = recognitionContext.state
  const visibleContact = (frame.leftHandVisible || frame.rightHandVisible)
    ? recognitionContext.activeTouch ?? frame.closestContact
    : null

  currentCandidateLabel.value = recognitionContext.candidate
    ? `${recognitionContext.candidate.gestureLabel} / ${getGestureApplicationLabel(recognitionContext.candidate.gesture)}`
    : '없음'
  currentTouchLabel.value = visibleContact ? getTouchLabel(visibleContact) : '없음'
  currentTouchGesture.value = visibleContact?.gesture ?? ''
  touchProgressPercent.value = visibleContact ? Math.round(recognitionContext.touchProgress * 100) : 0
  touchDistanceText.value = visibleContact ? `${visibleContact.normalizedDistance.toFixed(2)}` : '없음'
  cooldownRemainingMs.value = Math.max(0, recognitionContext.cooldownUntil - now)

  if (recognitionContext.errorMessage) errorMessage.value = recognitionContext.errorMessage
  else if (errorMessage.value && recognitionContext.state !== 'error') errorMessage.value = ''
}

function getTouchLabel(contact: TouchContact) {
  const command = touchGestureCommands.find((item) => item.gesture === contact.gesture)
  return command?.gestureLabel ?? contact.gesture
}

function getPoseWarning(frame: TouchFrame) {
  const blockedPose = [frame.leftPoseQuality, frame.rightPoseQuality].find((quality) => quality && !quality.isAcceptable)
  if (!blockedPose) return ''
  if (blockedPose.reason === 'palm_edge_on') {
    return '손이 카메라 방향으로 세워져 있어 인식을 보류합니다. 손바닥을 카메라와 더 평행하게 돌리세요.'
  }
  if (blockedPose.reason === 'fist_closed') {
    return '주먹처럼 손가락이 접혀 있어 인식을 보류합니다. 접촉할 손가락을 펴서 보여주세요.'
  }
  if (blockedPose.reason === 'fingertips_overlapped') {
    return '손가락 끝이 화면에서 겹쳐 보여 인식을 보류합니다. 손가락 사이가 보이게 자세를 바꾸세요.'
  }
  return ''
}

function showGestureCompletionNotice(candidate: GestureCandidate) {
  gestureCompletionNotice.value = `${candidate.gestureLabel} 완료`
  if (gestureCompletionTimer) clearTimeout(gestureCompletionTimer)
  gestureCompletionTimer = setTimeout(() => {
    gestureCompletionNotice.value = ''
    gestureCompletionTimer = null
  }, 1600)
}

function clearGestureCompletionNotice() {
  gestureCompletionNotice.value = ''
  if (gestureCompletionTimer) {
    clearTimeout(gestureCompletionTimer)
    gestureCompletionTimer = null
  }
}

async function notifyGestureResult(payload: {
  status: 'success' | 'failure'
  gestureLabel: string
  appLabel: string
  message?: string
}) {
  try {
    await window.aircommands.notifyGesture(payload)
  } catch {
    // Best-effort notification only. Failure should not affect recognition flow.
  }
}

async function executeCandidate(candidate: GestureCandidate) {
  const inputSequence = settings.value?.inputSequenceAssignments[candidate.gesture]
  if (inputSequence) {
    const sequenceLabel = formatInputSequence(inputSequence)
    const actionLabel = `입력 시퀀스 ${sequenceLabel}`
    commandResultMessage.value = `${actionLabel} 실행 중`
    try {
      const response = await window.aircommands.executeInputSequence({
        gesture: candidate.gesture,
      })
      if (response.success) {
        commandResultMessage.value = `${actionLabel} 완료`
        await notifyGestureResult({
          status: 'success',
          gestureLabel: candidate.gestureLabel,
          appLabel: actionLabel,
        })
      } else {
        commandResultMessage.value = `${actionLabel} 실패`
        errorMessage.value = response.message
        await notifyGestureResult({
          status: 'failure',
          gestureLabel: candidate.gestureLabel,
          appLabel: actionLabel,
          message: response.message,
        })
      }
    } catch (error) {
      commandResultMessage.value = `${actionLabel} 실패`
      const message = error instanceof Error ? error.message : '입력 시퀀스를 실행하지 못했습니다.'
      errorMessage.value = message
      await notifyGestureResult({
        status: 'failure',
        gestureLabel: candidate.gestureLabel,
        appLabel: actionLabel,
        message,
      })
    }
    return
  }

  const windowsCommand = settings.value?.windowsCommandAssignments[candidate.gesture]
  const windowsCommandOption = getWindowsCommandOption(windowsCommand)
  if (windowsCommand && windowsCommandOption) {
    const actionLabel = windowsCommandOption.label
    commandResultMessage.value = `${actionLabel} 실행 중`
    try {
      const response = await window.aircommands.executeWindowsCommand({
        gesture: candidate.gesture,
      })
      if (response.success) {
        commandResultMessage.value = `${actionLabel} 완료`
        await notifyGestureResult({
          status: 'success',
          gestureLabel: candidate.gestureLabel,
          appLabel: actionLabel,
        })
      } else {
        commandResultMessage.value = `${actionLabel} 실패`
        errorMessage.value = response.message
        await notifyGestureResult({
          status: 'failure',
          gestureLabel: candidate.gestureLabel,
          appLabel: actionLabel,
          message: response.message,
        })
      }
    } catch (error) {
      commandResultMessage.value = `${actionLabel} 실패`
      const message = error instanceof Error ? error.message : 'Windows 기능을 실행하지 못했습니다.'
      errorMessage.value = message
      await notifyGestureResult({
        status: 'failure',
        gestureLabel: candidate.gestureLabel,
        appLabel: actionLabel,
        message,
      })
    }
    return
  }

  const applicationId = settings.value?.gestureAssignments[candidate.gesture]
  const application = applicationId
    ? settings.value?.applications.find((item) => item.id === applicationId)
    : null
  if (!applicationId || !application) {
    commandResultMessage.value = `${candidate.gestureLabel} 미배정`
    errorMessage.value = '이 제스처에 실행 동작이 배정되지 않았습니다.'
    return
  }

  const applicationLabel = `${application.name} 실행`
  commandResultMessage.value = `${applicationLabel} 요청 중`
  const timeoutId = window.setTimeout(() => {
    commandResultMessage.value = `${applicationLabel} 실패`
    errorMessage.value = '앱 실행 요청이 지연되어 인식 흐름에서 분리했습니다.'
  }, EXECUTION_REQUEST_TIMEOUT_MS)

  try {
    const response = await window.aircommands.openApp({
      applicationId,
      source: 'gesture',
      gesture: candidate.gesture,
      clientRequestId: `${candidate.gesture}-${applicationId}-${Math.round(candidate.detectedAt)}`,
    })

    if (response.success) {
      commandResultMessage.value = `${applicationLabel} 완료`
      await notifyGestureResult({
        status: 'success',
        gestureLabel: candidate.gestureLabel,
        appLabel: application.name,
      })
    } else {
      commandResultMessage.value = `${applicationLabel} 실패`
      errorMessage.value = response.message
      await notifyGestureResult({
        status: 'failure',
        gestureLabel: candidate.gestureLabel,
        appLabel: application.name,
        message: response.message,
      })
    }
  } catch (error) {
    commandResultMessage.value = `${applicationLabel} 실패`
    const message = error instanceof Error ? error.message : '앱 실행 요청에 실패했습니다.'
    errorMessage.value = message
    await notifyGestureResult({
      status: 'failure',
      gestureLabel: candidate.gestureLabel,
      appLabel: application.name,
      message,
    })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

onMounted(async () => {
  removeCatalogListener = window.aircommands.onApplicationCatalogUpdated((response) => {
    if (!response.success || !settings.value) return
    const discoveredIcons = new Map(
      response.applications.flatMap((application) =>
        application.registeredApplicationId && application.iconDataUrl
          ? [[application.registeredApplicationId, application.iconDataUrl] as const]
          : []),
    )
    if (discoveredIcons.size === 0) return

    settings.value = {
      ...settings.value,
      applications: settings.value.applications.map((application) => ({
        ...application,
        iconDataUrl: discoveredIcons.get(application.id) ?? application.iconDataUrl,
      })),
    }
  })
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleWindowBlur)
  await loadSettings()
  await startCamera()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
  removeCatalogListener?.()
  clearGestureCompletionNotice()
  stopCamera()
})
</script>

<template>
  <main class="page">
    <div v-if="gestureCompletionNotice" class="notice success">{{ gestureCompletionNotice }}</div>

    <section class="camera-card">
      <div class="camera-wrap">
        <video ref="videoRef" muted playsinline class="camera" />
        <canvas ref="canvasRef" class="overlay" />

        <div class="status-grid">
          <div class="status-item">
            <div class="status-label">상태</div>
            <div class="status-value">{{ trackingStatus }}</div>
          </div>
          <div class="status-item">
            <div class="status-label">가까운 접촉</div>
            <div class="status-value">{{ currentTouchLabel }}</div>
          </div>
          <div class="status-item">
            <div class="status-label">실행 후보</div>
            <div class="status-value">{{ currentCandidateLabel }}</div>
          </div>
          <div
            class="status-item configurable"
            role="button"
            tabindex="0"
            :title="`제스처 유지 시간 설정 · 현재 ${gestureHoldMs}ms`"
            @click="isGestureHoldDialogOpen = true"
            @keydown.enter="isGestureHoldDialogOpen = true"
            @keydown.space.prevent="isGestureHoldDialogOpen = true">
            <div class="status-label">
              <span>유지</span>
              <span class="status-setting">{{ gestureHoldMs }}ms</span>
            </div>
            <div class="status-inline">
              <div class="status-value">{{ touchProgressPercent }}%</div>
              <div class="status-progress" role="progressbar" aria-label="유지 진행도" :aria-valuenow="touchProgressPercent" aria-valuemin="0" aria-valuemax="100">
                <span class="status-progress-fill" :style="{ width: `${touchProgressPercent}%` }" />
              </div>
            </div>
          </div>
          <div class="status-item">
            <div class="status-label">거리</div>
            <div class="status-value">{{ touchDistanceText }}</div>
          </div>
          <div class="status-item">
            <div class="status-label">쿨다운</div>
            <div class="status-value">{{ cooldownSeconds > 0 ? `${cooldownSeconds}초` : '없음' }}</div>
          </div>
        </div>

        <div class="phase-guide">{{ phaseGuideText }}</div>
      </div>
    </section>

    <section class="one-hand-grid">
      <article v-for="group in oneHandGestureGroups" :key="group.hand" class="one-hand-card">
        <header>
          <h3>{{ group.label }} 제스처</h3>
          <span class="shape-chip" :class="group.hand === 'Left' ? 'left' : 'right'">
            <span class="shape-icon" :class="group.hand === 'Left' ? 'square' : 'triangle'" aria-hidden="true" />
            <span>{{ group.shapeLabel }} 표시</span>
          </span>
        </header>
        <ul>
          <li
            v-for="command in group.commands"
            :key="command.gesture"
            :class="{
              active: command.gesture === currentTouchGesture,
            }"
            tabindex="0"
            role="button"
            @click="openApplicationPicker(command.gesture)"
            @keydown.enter="openApplicationPicker(command.gesture)">
            <span class="gesture-label-line">
              <span
                class="mark-shape"
                :class="group.hand === 'Left' ? 'dot' : 'tri'"
                :style="group.hand === 'Left'
                  ? { backgroundColor: getFingerColor(command.primaryFinger) }
                  : { borderBottomColor: getFingerColor(command.primaryFinger) }"
                aria-hidden="true" />
              <span class="mark-plus">+</span>
              <span
                class="mark-shape"
                :class="group.hand === 'Left' ? 'dot' : 'tri'"
                :style="group.hand === 'Left'
                  ? { backgroundColor: getFingerColor(command.secondaryFinger) }
                  : { borderBottomColor: getFingerColor(command.secondaryFinger) }"
                aria-hidden="true" />
              <span>{{ command.gestureLabel }}</span>
            </span>
            <strong>
              <img
                v-if="getGestureApplicationIconDataUrl(command.gesture)"
                :src="getGestureApplicationIconDataUrl(command.gesture)"
                alt=""
                class="gesture-application-icon">
              <span v-else>{{ getGestureApplicationIcon(command.gesture) }}</span>
              {{ getGestureApplicationLabel(command.gesture) }}
              <span v-if="getGestureModifierBadge(command.gesture)" class="modifier-badge">
                {{ getGestureModifierBadge(command.gesture) }}
              </span>
            </strong>
          </li>
        </ul>
      </article>
    </section>

    <footer class="bottom-bar">
      <button v-if="!isCameraActive" type="button" class="primary" @click="startCamera">시작</button>
      <button v-else type="button" class="secondary" @click="stopCamera">정지</button>

      <span v-if="activeTouchCommand" class="pill">
        현재 동작:
        <img
          v-if="activeTouchApplicationIconDataUrl || activeTouchApplication?.iconDataUrl"
          :src="activeTouchApplicationIconDataUrl || activeTouchApplication?.iconDataUrl"
          alt=""
          class="gesture-application-icon">
        <span v-else>{{ activeTouchApplicationIcon }}</span>
        {{ activeTouchApplicationLabel }}
      </span>
      <span v-if="commandResultMessage" class="pill success">{{ commandResultMessage }}</span>
      <span v-if="errorMessage" class="pill warn">{{ errorMessage }}</span>
      <button
        type="button"
        class="secondary compact reset-button"
        :disabled="!hasGestureAssignments || isClearingAssignments || isEditingCommands"
        @click="clearAllGestureAssignments">
        {{ isClearingAssignments ? '비우는 중…' : '모든 배정 해제' }}
      </button>
    </footer>

    <ApplicationPickerDialog
      v-if="applicationPickerGesture && settings"
      :settings="settings"
      :gesture="applicationPickerGesture"
      @close="applicationPickerGesture = null"
      @update="updateSettings"
      @status="handleSettingsStatus" />

    <GestureHoldDialog
      v-if="isGestureHoldDialogOpen"
      :gesture-hold-ms="gestureHoldMs"
      @close="isGestureHoldDialogOpen = false"
      @update="updateSettings"
      @status="handleSettingsStatus" />
  </main>
</template>

<style scoped>
.page {
  min-height: 100%;
  color: #e7f0fb;
  padding: 16px;
  display: grid;
  gap: 12px;
  grid-template-rows: auto auto auto;
  box-sizing: border-box;
  max-width: 1280px;
  margin: 0 auto;
  overflow-x: clip;
}

.notice {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 12px;
  z-index: 60;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.01em;
}

.notice.success {
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.65);
  box-shadow: 0 10px 30px rgba(16, 185, 129, 0.22);
}

.camera-card,
.one-hand-card {
  border: 1px solid rgba(94, 119, 150, 0.35);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(16, 26, 38, 0.88), rgba(10, 17, 28, 0.88));
  box-shadow: 0 10px 26px rgba(1, 6, 15, 0.35);
}

.camera-wrap {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: inherit;
}

.camera,
.overlay {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scaleX(-1);
}

.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.status-grid {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(3, 8, 16, 0.66);
  backdrop-filter: blur(8px);
}

.status-item {
  padding: 8px 10px;
  border-right: 1px solid rgba(148, 163, 184, 0.22);
}

.status-item:last-child {
  border-right: 0;
}

.status-item.configurable {
  cursor: pointer;
  transition: background-color 140ms ease, box-shadow 140ms ease;
}

.status-item.configurable:hover,
.status-item.configurable:focus-visible {
  outline: none;
  background: rgba(56, 189, 248, 0.14);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.55);
}

.status-item.configurable .status-label {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}

.status-setting {
  color: #7dd3fc;
  font-size: 10px;
  text-transform: none;
}

.status-label {
  font-size: 11px;
  color: #a2bad7;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.status-value {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-inline {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-inline .status-value {
  margin-top: 0;
  white-space: nowrap;
}

.status-progress {
  height: 5px;
  flex: 1;
  border-radius: 999px;
  background: rgba(71, 85, 105, 0.55);
  overflow: hidden;
}

.status-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #22d3ee);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.45);
  transition: width 120ms linear;
}

.phase-guide {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(3, 8, 16, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.35);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.mark-plus {
  color: #9eb6d1;
  font-weight: 700;
}

.mark-shape {
  display: inline-block;
  flex: 0 0 auto;
}

.mark-shape.dot {
  width: 13px;
  height: 13px;
  border-radius: 999px;
}

.mark-shape.tri,
.mark-shape.triangle {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 13px solid #38bdf8;
  transform: translateY(-1px);
}

.one-hand-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.one-hand-card {
  padding: 12px;
}

.one-hand-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}

.one-hand-card h3 {
  margin: 0;
  font-size: 16px;
}

.one-hand-card header span {
  font-size: 12px;
  color: #98b0cb;
}

.shape-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(15, 23, 42, 0.62);
}

.shape-chip.left {
  border-color: rgba(56, 189, 248, 0.6);
}

.shape-chip.right {
  border-color: rgba(251, 191, 36, 0.6);
}

.shape-icon {
  display: inline-block;
}

.shape-icon.square {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: #38bdf8;
}

.shape-icon.triangle {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 11px solid #f59e0b;
  transform: translateY(-1px);
}

.one-hand-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.one-hand-card li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid rgba(94, 119, 150, 0.45);
  border-radius: 10px;
  padding: 10px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease;
}

.one-hand-card li:hover,
.one-hand-card li:focus-visible {
  outline: none;
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
}

.gesture-label-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.one-hand-card li strong {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.gesture-application-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  object-fit: contain;
  vertical-align: middle;
}

.one-hand-card li.active {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
}

.one-hand-card li.fixed {
  border-color: rgba(167, 139, 250, 0.65);
  background: rgba(124, 58, 237, 0.12);
}

.fixed-label {
  color: #c4b5fd;
  font-size: 10px;
  letter-spacing: 0.03em;
}

.modifier-badge {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(14, 165, 233, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.6);
  color: #38bdf8;
  letter-spacing: 0.02em;
}

.bottom-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(94, 119, 150, 0.35);
  border-radius: 12px;
  background: rgba(9, 15, 25, 0.72);
  padding: 10px 12px;
}

button {
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-weight: 700;
  cursor: pointer;
  font-size: 13px;
}

button.primary {
  background: linear-gradient(135deg, #1d4ed8, #0284c7);
  color: white;
}

button.secondary {
  background: transparent;
  color: #d7e2ef;
  border: 1px solid #4f6a89;
}

.reset-button {
  margin-left: auto;
  color: #fca5a5 !important;
  border-color: rgba(248, 113, 113, 0.5) !important;
}

button.compact {
  padding: 7px 10px;
  font-size: 12px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pill {
  border: 1px solid #49637e;
  border-radius: 999px;
  padding: 7px 11px;
  font-size: 13px;
  background: rgba(10, 20, 31, 0.85);
  max-width: 100%;
  overflow-wrap: anywhere;
}

.pill.success {
  border-color: rgba(16, 185, 129, 0.7);
}

.pill.warn {
  border-color: rgba(251, 191, 36, 0.75);
}

@media (max-width: 980px) {
  .page {
    padding: 12px;
  }

  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .one-hand-grid {
    grid-template-columns: 1fr;
  }

  .bottom-bar {
    justify-content: center;
  }

  .reset-button {
    margin-left: 0;
  }
}

@media (max-width: 640px) {
  .page {
    padding: 10px;
  }

  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .status-label {
    font-size: 10px;
  }

  .status-value {
    font-size: 12px;
  }

  .one-hand-card h3 {
    font-size: 15px;
  }
}
</style>
