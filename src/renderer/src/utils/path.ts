const normalizePath = (path: string): string => path.replace(/\\/g, '/')

export const isFilePath = (path: string): boolean => {
  if (path.endsWith('/') || path.endsWith('\\')) return false
  const separator = path.includes('\\') ? '\\' : '/'
  const fileName = path.split(separator).pop() || ''
  return /\.[^./\\]+$/.test(fileName)
}

const getParentPath = (path: string): string => {
  const normalized = normalizePath(path).replace(/\/+$/, '')
  if (!normalized) return '/'
  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex <= 0) return '/'
  return normalized.slice(0, lastSlashIndex)
}

export const getTopThreeLevelPath = (path: string): string => {
  const parentPath = getParentPath(path)
  const normalized = normalizePath(parentPath).replace(/\/+$/, '')
  const hasLeadingSlash = normalized.startsWith('/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return '/'
  const groupedPath = parts.slice(0, 3).join('/')
  return hasLeadingSlash ? `/${groupedPath}` : groupedPath
}

export const getRelativePathForDisplay = (fullPath: string, groupPath: string): string => {
  const normalizedFullPath = normalizePath(fullPath)
  const normalizedGroupPath = normalizePath(groupPath).replace(/\/+$/, '')

  if (!normalizedGroupPath || normalizedGroupPath === '/') {
    return normalizedFullPath.replace(/^\/+/, '')
  }

  const prefix = `${normalizedGroupPath}/`
  if (normalizedFullPath.startsWith(prefix)) {
    return normalizedFullPath.slice(prefix.length)
  }

  return normalizedFullPath
}
