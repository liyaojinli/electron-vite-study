export const arraysEqual = <T>(a: T[], b: T[]): boolean => {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}
