import { describe, expect, it } from 'vitest'
import {
  filterAndSortApplications,
  filterSelectableRegisteredApplications,
  normalizeApplicationSearch,
} from '../application_search'

describe('application search', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeApplicationSearch('  Visual   Studio CODE ')).toBe('visual studio code')
  })

  it('filters by partial name and sorts the result', () => {
    const applications = [
      { name: 'Visual Studio Code', id: 'code' },
      { name: 'Visual Studio', id: 'visual-studio' },
      { name: 'Notepad', id: 'notepad' },
    ]

    expect(filterAndSortApplications(applications, 'VISUAL').map((item) => item.id))
      .toEqual(['visual-studio', 'code'])
  })

  it('hides legacy built-ins from the Windows picker', () => {
    const applications = [
      { name: 'Chrome', id: 'builtin-chrome', targetKind: 'builtin' },
      { name: 'Portable Tool', id: 'portable', targetKind: 'windows-path' },
      { name: 'Store App', id: 'store', targetKind: 'windows-app-id' },
    ]

    expect(
      filterSelectableRegisteredApplications(applications, '', false)
        .map((application) => application.id),
    ).toEqual(['portable', 'store'])
  })

  it('keeps built-ins selectable on platforms without installed-app discovery', () => {
    const applications = [
      { name: 'Firefox', id: 'firefox', targetKind: 'builtin' },
      { name: 'Chrome', id: 'chrome', targetKind: 'builtin' },
    ]

    expect(
      filterSelectableRegisteredApplications(applications, 'fire', true)
        .map((application) => application.id),
    ).toEqual(['firefox'])
  })
})
