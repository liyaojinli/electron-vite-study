import os from 'os'

interface OsUtils {
  getCpuCores: () => number
  getTotalMemoryBytes: () => number
  getOperatingSystem: () => string
}

export const osUtils: OsUtils = {
  getCpuCores: () => os.cpus().length,
  getTotalMemoryBytes: () => os.totalmem(),
  getOperatingSystem: () => os.platform()
}
