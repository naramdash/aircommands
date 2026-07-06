import type { HandGestureName } from './hand_sequence_state_machine'

export type HandCommandSequence = {
  id: string
  label: string
  sequence: HandGestureName[]
}

export const handCommandSequences: HandCommandSequence[] = [
  {
    id: 'thumb-up',
    label: '엄지 위',
    sequence: ['gesture_thumb_up'],
  },
  {
    id: 'thumb-down',
    label: '엄지 아래',
    sequence: ['gesture_thumb_down'],
  },
  {
    id: 'thumb-left',
    label: '엄지 왼쪽',
    sequence: ['gesture_thumb_left'],
  },
  {
    id: 'thumb-right',
    label: '엄지 오른쪽',
    sequence: ['gesture_thumb_right'],
  },
  {
    id: 'index-point',
    label: '검지',
    sequence: ['gesture_index_point'],
  },
  {
    id: 'middle-point',
    label: '중지',
    sequence: ['gesture_middle_point'],
  },
  {
    id: 'pinky-point',
    label: '새끼',
    sequence: ['gesture_pinky_point'],
  },
  {
    id: 'peace',
    label: '브이',
    sequence: ['gesture_peace'],
  },
  {
    id: 'rock',
    label: '락',
    sequence: ['gesture_rock'],
  },
  {
    id: 'three',
    label: '세 손가락',
    sequence: ['gesture_three'],
  },
  {
    id: 'thumb-left-right',
    label: '왼쪽 오른쪽',
    sequence: ['gesture_thumb_left', 'gesture_thumb_right'],
  },
  {
    id: 'thumb-up-down',
    label: '위 아래',
    sequence: ['gesture_thumb_up', 'gesture_thumb_down'],
  },
  {
    id: 'thumb-left-up-right',
    label: '왼쪽 위 오른쪽',
    sequence: ['gesture_thumb_left', 'gesture_thumb_up', 'gesture_thumb_right'],
  },
  {
    id: 'point-peace',
    label: '검지 브이',
    sequence: ['gesture_index_point', 'gesture_peace'],
  },
  {
    id: 'pinky-rock',
    label: '새끼 락',
    sequence: ['gesture_pinky_point', 'gesture_rock'],
  },
  {
    id: 'point-three-rock',
    label: '검지 세손 락',
    sequence: ['gesture_index_point', 'gesture_three', 'gesture_rock'],
  },
]
