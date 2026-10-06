export type WindowsCommandOption = {
  command: WindowsCommand
  label: string
  description: string
  icon: string
}

export const WINDOWS_COMMAND_OPTIONS: WindowsCommandOption[] = [
  {
    command: 'switch-window-next',
    label: '다음 창으로 전환',
    description: 'Alt + Tab과 같은 동작을 실행합니다.',
    icon: '↪️',
  },
  {
    command: 'switch-window-previous',
    label: '이전 창으로 전환',
    description: 'Alt + Shift + Tab과 같은 동작을 실행합니다.',
    icon: '↩️',
  },
  {
    command: 'open-screen-snipping',
    label: '화면 캡처 열기',
    description: 'Windows 영역 캡처 화면을 엽니다 (Win + Shift + S).',
    icon: '✂️',
  },
  {
    command: 'save-full-screenshot',
    label: '전체 화면 캡처 및 즉시 저장',
    description: '전체 화면을 캡처하여 내 사진/Screenshots 폴더에 파일로 자동 저장합니다 (Win + PrtScn).',
    icon: '📸',
  },
  {
    command: 'toggle-screen-recording',
    label: '화면 녹화 시작 / 중지',
    description: 'Windows 게임 바 화면 녹화를 시작하거나 중지합니다 (Win + Alt + R).',
    icon: '📹',
  },
  {
    command: 'open-game-bar',
    label: '게임 바 (녹화 / 오디오) 열기',
    description: '화면 녹화 및 오디오 설정을 할 수 있는 게임 바 오버레이를 엽니다 (Win + G).',
    icon: '🎮',
  },
  {
    command: 'show-desktop',
    label: '바탕화면 보기 / 복원',
    description: '바탕화면을 보거나 열려 있던 창들을 복원합니다 (Win + D).',
    icon: '🖥️',
  },
  {
    command: 'task-view',
    label: '작업 보기 (Task View)',
    description: '실행 중인 모든 창과 가상 바탕화면을 표시합니다 (Win + Tab).',
    icon: '🔲',
  },
  {
    command: 'lock-workstation',
    label: '컴퓨터 잠금',
    description: 'Windows 화면을 즉시 잠급니다 (Win + L).',
    icon: '🔒',
  },
  {
    command: 'open-action-center',
    label: '알림 센터 / 빠른 설정',
    description: 'Windows 알림 센터 및 빠른 설정창을 엽니다 (Win + A).',
    icon: '🔔',
  },
  {
    command: 'open-file-explorer',
    label: '파일 탐색기 열기',
    description: 'Windows 파일 탐색기를 엽니다 (Win + E).',
    icon: '📁',
  },
  {
    command: 'open-clipboard-history',
    label: '클립보드 기록 열기',
    description: '복사했던 클립보드 기록 창을 엽니다 (Win + V).',
    icon: '📋',
  },
  {
    command: 'open-emoji-picker',
    label: '이모지 창 열기',
    description: '이모지 및 기호 입력 창을 엽니다 (Win + .).',
    icon: '😃',
  },
]

export function getWindowsCommandOption(command: WindowsCommand | null | undefined) {
  return WINDOWS_COMMAND_OPTIONS.find((option) => option.command === command) ?? null
}
