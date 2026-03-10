export interface SvnLogEntry {
  revision: number
  author: string
  date: string
  message: string
}

export interface SvnChangedFile {
  status: string
  path: string
}

export interface AffectedFileGroup {
  revision: number
  files: SvnChangedFile[]
}

export interface AffectedFilePathGroup {
  path: string
  files: SvnChangedFile[]
}
