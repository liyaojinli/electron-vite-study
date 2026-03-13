export type RevisionStatus = 'pending' | 'merging' | 'success' | 'conflict' | 'failed'

export interface RevisionMergeState {
  revision: number
  status: RevisionStatus
  files?: string[]
  message?: string
}

export interface MergeSessionResult {
  targetRepoName: string
  targetRepoUrl: string
  targetRepoPath: string
  sourceRepoUrl: string
  revisions: RevisionMergeState[]
  currentRevisionIndex: number
  allCompleted: boolean
  success: boolean
  message: string
  files?: string[]
  onlyFiles?: string[]
  trackedFiles?: string[]
  isMerging?: boolean
  hasTreeConflict: boolean
}

export interface FileWithStatus {
  path: string
  status: string
}

export interface RepositoryToCommit {
  targetRepoName: string
  targetRepoPath: string
  files: FileWithStatus[]
}
