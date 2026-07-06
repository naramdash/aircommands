import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { fingerDefinitions } from './command_map'
import { getLeftHandIndex, getRightHandIndex } from './coordinates'
import type {
  FingerTip,
  Handedness,
  HandednessCategory,
  HandPoseQuality,
  OneHandTouchFingerName,
  Point2D,
  TouchContact,
  TwoHandTouchFrame,
} from './types'

export const TOUCH_ENTER_DISTANCE = 0.42
export const TOUCH_EXIT_DISTANCE = 0.58
export const TOUCH_MIN_HAND_SCALE = 0.04
export const TOUCH_DEPTH_WEIGHT = 0.7
export const MIN_PROJECTED_PALM_QUALITY = 0.72
export const MIN_FINGERTIP_SPREAD = 0.35
export const MAX_TOUCH_DEPTH_DELTA = 0.62
export const MAX_FOLDED_FINGER_RATIO = 0.75
export const MIN_FOLDED_FINGER_COUNT = 3

const ONE_HAND_TOUCH_FINGERS: OneHandTouchFingerName[] = [
  'index',
  'middle',
  'ring',
]

const FIST_FINGER_CHAINS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const

export function getTwoHandTouchFrame(
  hands: NormalizedLandmark[][],
  handednesses: HandednessCategory[][] = [],
  at: number,
): TwoHandTouchFrame {
  const leftHand = hands[getLeftHandIndex(handednesses)]
  const rightHand = hands[getRightHandIndex(handednesses)]
  const leftTips = leftHand ? getFingerTips(leftHand) : []
  const rightTips = rightHand ? getFingerTips(rightHand) : []
  const leftPoseQuality = leftHand ? getHandPoseQuality(leftHand, leftTips) : null
  const rightPoseQuality = rightHand ? getHandPoseQuality(rightHand, rightTips) : null
  const contactCandidates = [
    leftHand &&
    rightHand &&
    leftPoseQuality?.isAcceptable &&
    rightPoseQuality?.isAcceptable
      ? getClosestTouchContact(leftHand, rightHand, leftTips, rightTips)
      : null,
    leftHand && leftPoseQuality?.isAcceptable
      ? getClosestOneHandTouchContact(leftHand, 'Left', leftTips)
      : null,
    rightHand && rightPoseQuality?.isAcceptable
      ? getClosestOneHandTouchContact(rightHand, 'Right', rightTips)
      : null,
  ]
  const closestContact = getClosestContact(contactCandidates)

  return {
    at,
    leftHandVisible: Boolean(leftHand),
    rightHandVisible: Boolean(rightHand),
    leftTips,
    rightTips,
    leftPoseQuality,
    rightPoseQuality,
    closestContact,
  }
}

export function getFingerTips(hand: NormalizedLandmark[]): FingerTip[] {
  return fingerDefinitions.flatMap((finger) => {
    const landmark = hand[finger.landmarkIndex]
    if (!landmark) return []

    return [
      {
        finger: finger.name,
        label: finger.label,
        shortLabel: finger.shortLabel,
        point: {
          x: landmark.x,
          y: landmark.y,
          z: landmark.z,
        },
      },
    ]
  })
}

export function getClosestTouchContact(
  leftHand: NormalizedLandmark[],
  rightHand: NormalizedLandmark[],
  leftTips = getFingerTips(leftHand),
  rightTips = getFingerTips(rightHand),
): TouchContact | null {
  const handScale = getAverageHandScale(leftHand, rightHand)
  let closestContact: TouchContact | null = null

  for (const leftTip of leftTips) {
    for (const rightTip of rightTips) {
      const normalizedDistance =
        getDistance3D(leftTip.point, rightTip.point) / handScale
      if (!isDepthDeltaAcceptable(leftTip.point, rightTip.point, handScale)) {
        continue
      }

      const confidence = getTouchConfidence(normalizedDistance)
      const contact: TouchContact = {
        gesture: `touch_left_${leftTip.finger}_right_${rightTip.finger}`,
        contactType: 'two_hand',
        hand: 'Both',
        primaryFinger: leftTip.finger,
        secondaryFinger: rightTip.finger,
        leftFinger: leftTip.finger,
        rightFinger: rightTip.finger,
        leftPoint: leftTip.point,
        rightPoint: rightTip.point,
        primaryPoint: leftTip.point,
        secondaryPoint: rightTip.point,
        midpoint: {
          x: (leftTip.point.x + rightTip.point.x) / 2,
          y: (leftTip.point.y + rightTip.point.y) / 2,
        },
        normalizedDistance,
        confidence,
      }

      if (
        !closestContact ||
        contact.normalizedDistance < closestContact.normalizedDistance
      ) {
        closestContact = contact
      }
    }
  }

  if (
    !closestContact ||
    closestContact.normalizedDistance > TOUCH_EXIT_DISTANCE
  ) {
    return null
  }

  return closestContact
}

export function getClosestOneHandTouchContact(
  hand: NormalizedLandmark[],
  handedness: Handedness,
  tips = getFingerTips(hand),
): TouchContact | null {
  const thumbTip = tips.find((tip) => tip.finger === 'thumb')
  const handScale = getHandScale(hand)
  let closestContact: TouchContact | null = null

  if (!thumbTip) return null
  if (handedness !== 'Left' && handedness !== 'Right') return null

  const handPrefix = handedness === 'Left' ? 'left' : 'right'

  for (const finger of ONE_HAND_TOUCH_FINGERS) {
    const targetTip = tips.find((tip) => tip.finger === finger)
    if (!targetTip) continue

    const normalizedDistance =
      getDistance3D(thumbTip.point, targetTip.point) / handScale
    if (!isDepthDeltaAcceptable(thumbTip.point, targetTip.point, handScale)) {
      continue
    }

    const confidence = getTouchConfidence(normalizedDistance)
    const contact: TouchContact = {
      gesture: `touch_${handPrefix}_thumb_${finger}`,
      contactType: 'one_hand',
      hand: handedness,
      primaryFinger: 'thumb',
      secondaryFinger: finger,
      leftPoint: thumbTip.point,
      rightPoint: targetTip.point,
      primaryPoint: thumbTip.point,
      secondaryPoint: targetTip.point,
      midpoint: {
        x: (thumbTip.point.x + targetTip.point.x) / 2,
        y: (thumbTip.point.y + targetTip.point.y) / 2,
      },
      normalizedDistance,
      confidence,
    }

    if (
      !closestContact ||
      contact.normalizedDistance < closestContact.normalizedDistance
    ) {
      closestContact = contact
    }
  }

  if (
    !closestContact ||
    closestContact.normalizedDistance > TOUCH_EXIT_DISTANCE
  ) {
    return null
  }

  return closestContact
}

function getClosestContact(contacts: Array<TouchContact | null>) {
  return contacts.reduce<TouchContact | null>((closestContact, contact) => {
    if (!contact) return closestContact

    if (
      !closestContact ||
      contact.normalizedDistance < closestContact.normalizedDistance
    ) {
      return contact
    }

    return closestContact
  }, null)
}

export function isTouchEntered(contact: TouchContact | null) {
  return Boolean(contact && contact.normalizedDistance <= TOUCH_ENTER_DISTANCE)
}

export function isTouchStillActive(contact: TouchContact | null) {
  return Boolean(contact && contact.normalizedDistance <= TOUCH_EXIT_DISTANCE)
}

export function getHandPoseQuality(
  hand: NormalizedLandmark[],
  tips = getFingerTips(hand),
): HandPoseQuality {
  const indexMcp = hand[5]
  const pinkyMcp = hand[17]
  const projectedPalmQuality =
    indexMcp && pinkyMcp
      ? getProjectedQuality(indexMcp, pinkyMcp)
      : 1
  const fingertipSpread = getNormalizedFingertipSpread(tips, getHandScale(hand))
  const foldedFingerCount = getFoldedFingerCount(hand)

  if (projectedPalmQuality < MIN_PROJECTED_PALM_QUALITY) {
    return {
      isAcceptable: false,
      reason: 'palm_edge_on',
      projectedPalmQuality,
      fingertipSpread,
      foldedFingerCount,
    }
  }

  if (foldedFingerCount >= MIN_FOLDED_FINGER_COUNT) {
    return {
      isAcceptable: false,
      reason: 'fist_closed',
      projectedPalmQuality,
      fingertipSpread,
      foldedFingerCount,
    }
  }

  if (fingertipSpread < MIN_FINGERTIP_SPREAD) {
    return {
      isAcceptable: false,
      reason: 'fingertips_overlapped',
      projectedPalmQuality,
      fingertipSpread,
      foldedFingerCount,
    }
  }

  return {
    isAcceptable: true,
    reason: 'ok',
    projectedPalmQuality,
    fingertipSpread,
    foldedFingerCount,
  }
}

function getAverageHandScale(
  leftHand: NormalizedLandmark[],
  rightHand: NormalizedLandmark[],
) {
  return Math.max(
    (getHandScale(leftHand) + getHandScale(rightHand)) / 2,
    TOUCH_MIN_HAND_SCALE,
  )
}

function getHandScale(hand: NormalizedLandmark[]) {
  const indexMcp = hand[5]
  const pinkyMcp = hand[17]
  const wrist = hand[0]
  const middleMcp = hand[9]

  if (indexMcp && pinkyMcp) {
    return getDistance(indexMcp, pinkyMcp)
  }

  if (wrist && middleMcp) {
    return getDistance(wrist, middleMcp)
  }

  return TOUCH_MIN_HAND_SCALE
}

function getProjectedQuality(first: Point2D, second: Point2D) {
  const distance2D = getDistance(first, second)
  const distance3D = getDistance3D(first, second)

  if (distance3D <= 0.0001) return 1

  return clamp(distance2D / distance3D, 0, 1)
}

function getNormalizedFingertipSpread(tips: FingerTip[], handScale: number) {
  if (tips.length < 2) return 1

  let totalDistance = 0
  let count = 0

  for (let firstIndex = 0; firstIndex < tips.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < tips.length; secondIndex += 1) {
      totalDistance += getDistance(tips[firstIndex].point, tips[secondIndex].point)
      count += 1
    }
  }

  return count > 0 ? totalDistance / count / handScale : 1
}

function getFoldedFingerCount(hand: NormalizedLandmark[]) {
  return FIST_FINGER_CHAINS.reduce((count, chain) => {
    const [mcpIndex, pipIndex, dipIndex, tipIndex] = chain
    const mcp = hand[mcpIndex]
    const pip = hand[pipIndex]
    const dip = hand[dipIndex]
    const tip = hand[tipIndex]

    if (!mcp || !pip || !dip || !tip) return count

    const segmentLength =
      getDistance3D(mcp, pip) +
      getDistance3D(pip, dip) +
      getDistance3D(dip, tip)

    if (segmentLength <= 0.0001) return count

    const reachRatio = getDistance3D(mcp, tip) / segmentLength

    return reachRatio <= MAX_FOLDED_FINGER_RATIO ? count + 1 : count
  }, 0)
}

function isDepthDeltaAcceptable(
  first: Point2D,
  second: Point2D,
  handScale: number,
) {
  const depthDelta = Math.abs((first.z ?? 0) - (second.z ?? 0)) / handScale

  return depthDelta <= MAX_TOUCH_DEPTH_DELTA
}

function getTouchConfidence(normalizedDistance: number) {
  return clamp(
    1 - normalizedDistance / Math.max(TOUCH_EXIT_DISTANCE, 0.0001),
    0,
    1,
  )
}

function getDistance(first: Point2D, second: Point2D) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function getDistance3D(first: Point2D, second: Point2D) {
  return Math.hypot(
    first.x - second.x,
    first.y - second.y,
    ((first.z ?? 0) - (second.z ?? 0)) * TOUCH_DEPTH_WEIGHT,
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
