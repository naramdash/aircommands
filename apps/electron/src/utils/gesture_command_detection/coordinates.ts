import type { Handedness, HandednessCategory, Point2D } from './types'

export function toUserFacingPoint<T extends Point2D>(point: T): T {
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

export function getHandIndex(
  handednesses: HandednessCategory[][] = [],
  hand: Exclude<Handedness, 'Unknown'>,
) {
  return handednesses.findIndex((categories) => {
    return getHandedness(categories) === hand
  })
}

export function getLeftHandIndex(
  handednesses: HandednessCategory[][] = [],
) {
  return getHandIndex(handednesses, 'Left')
}

export function getRightHandIndex(
  handednesses: HandednessCategory[][] = [],
) {
  return getHandIndex(handednesses, 'Right')
}
