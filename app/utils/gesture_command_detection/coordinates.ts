import type {
  Handedness,
  HandednessCategory,
  PointerTrailPoint,
} from './types'

export function toUserFacingPoint(point: PointerTrailPoint): PointerTrailPoint {
  return {
    ...point,
    x: 1 - point.x,
  }
}

export function getHandedness(
  categories: HandednessCategory[] = [],
): Handedness {
  const label = categories[0]?.categoryName ?? categories[0]?.displayName

  if (label === 'Left' || label === 'Right') {
    return label
  }

  return 'Unknown'
}

export function getRightHandIndex(
  handednesses: HandednessCategory[][] = [],
) {
  return handednesses.findIndex((categories) => {
    return getHandedness(categories) === 'Right'
  })
}

