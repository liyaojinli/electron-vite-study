import type { MergeSessionResult, RevisionMergeState } from '../../../shared/merge'

export type ConflictResolvedChecker = (repoPath: string, filePath: string) => boolean

export const parseMergeFilePath = (fileEntry: string, repoPath?: string): string => {
  let filePath = fileEntry.substring(3).trim()

  if (repoPath && filePath.startsWith(repoPath)) {
    filePath = filePath.substring(repoPath.length)
    filePath = filePath.replace(/^[\\/]+/, '')
  }

  return filePath
}

export const isCommitableRelativePath = (filePath: string): boolean => {
  const normalized = filePath.trim().replace(/\\/g, '/')
  return normalized !== '' && normalized !== '.' && normalized !== './'
}

export const getEffectiveFileStatus = (
  fileEntry: string,
  repoPath?: string,
  isConflictResolved?: ConflictResolvedChecker
): string => {
  const rawStatus = fileEntry.substring(0, 1)
  if (rawStatus !== 'C' || !repoPath || !isConflictResolved) return rawStatus

  const filePath = parseMergeFilePath(fileEntry, repoPath)
  return isConflictResolved(repoPath, filePath) ? 'M' : 'C'
}

export const isConflictEntry = (
  fileEntry: string,
  repoPath?: string,
  isConflictResolved?: ConflictResolvedChecker
): boolean => {
  return getEffectiveFileStatus(fileEntry, repoPath, isConflictResolved) === 'C'
}

export const getDisplayFileName = (
  fileEntry: string,
  repoPath?: string,
  isConflictResolved?: ConflictResolvedChecker
): string => {
  const effectiveStatus = getEffectiveFileStatus(fileEntry, repoPath, isConflictResolved)
  const statusPrefix = `${effectiveStatus}  `
  const relativePath = parseMergeFilePath(fileEntry, repoPath)
  return statusPrefix + relativePath
}

export const getDisplayEntries = (result: MergeSessionResult): string[] => {
  return result.onlyFiles || result.files || []
}

export const getTrackedFilePaths = (result: MergeSessionResult): string[] => {
  const entries = result.trackedFiles || result.onlyFiles || result.files || []
  if (entries.length === 0 || !result.targetRepoPath) return []

  const filePaths = entries
    .map((fileEntry) => parseMergeFilePath(fileEntry, result.targetRepoPath))
    .filter((filePath) => isCommitableRelativePath(filePath))

  return Array.from(new Set(filePaths))
}

export const isRevisionConflictResolved = (
  revision: RevisionMergeState,
  repoPath: string,
  isConflictResolved: ConflictResolvedChecker
): boolean => {
  if (revision.status !== 'conflict') return false
  if (!revision.files || revision.files.length === 0) return false

  const conflictFiles = revision.files.filter((f) => f.startsWith('C'))
  if (conflictFiles.length === 0) return false

  return conflictFiles.every((fileEntry) => {
    const filePath = parseMergeFilePath(fileEntry, repoPath)
    return isConflictResolved(repoPath, filePath)
  })
}

export const hasUnresolvedConflicts = (
  result: MergeSessionResult,
  isConflictResolved: ConflictResolvedChecker
): boolean => {
  if (result.hasTreeConflict) {
    return true
  }

  if (
    result.revisions?.some(
      (revision) =>
        revision.status === 'conflict' &&
        (!result.targetRepoPath ||
          !isRevisionConflictResolved(revision, result.targetRepoPath, isConflictResolved))
    )
  ) {
    return true
  }

  if (!result.files || !result.targetRepoPath) return false
  return result.files.some(
    (fileEntry) =>
      getEffectiveFileStatus(fileEntry, result.targetRepoPath, isConflictResolved) === 'C'
  )
}

export const getCommitFilePaths = (
  result: MergeSessionResult,
  isConflictResolved: ConflictResolvedChecker
): string[] => {
  const entries = result.onlyFiles || result.files || []
  if (entries.length === 0 || !result.targetRepoPath) return []

  const commitableStatuses = new Set(['A', 'M', 'D', 'R'])
  const filePaths = entries
    .filter((fileEntry) =>
      commitableStatuses.has(
        getEffectiveFileStatus(fileEntry, result.targetRepoPath, isConflictResolved)
      )
    )
    .map((fileEntry) => parseMergeFilePath(fileEntry, result.targetRepoPath))
    .filter((filePath) => isCommitableRelativePath(filePath))

  return Array.from(new Set(filePaths))
}
