export function normalizeApplicationSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function filterAndSortApplications<T extends { name: string }>(
  applications: T[],
  query: string,
) {
  const normalizedQuery = normalizeApplicationSearch(query)
  return [...applications]
    .filter((application) =>
      normalizeApplicationSearch(application.name).includes(normalizedQuery))
    .sort((left, right) =>
      left.name.localeCompare(right.name, 'ko', { sensitivity: 'base' }))
}

export function filterSelectableRegisteredApplications<
  T extends { name: string, targetKind: string },
>(
  applications: T[],
  query: string,
  includeBuiltins = false,
) {
  return filterAndSortApplications(
    applications.filter((application) =>
      includeBuiltins || application.targetKind !== 'builtin'),
    query,
  )
}
