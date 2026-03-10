export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateInfo {
  status: UpdateStatus
  version?: string
  progress?: number
  error?: string
  releaseNotes?: string
  releaseDate?: string
}
