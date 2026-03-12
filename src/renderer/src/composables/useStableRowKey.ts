interface HasOptionalId {
  id?: string
}

export const useStableRowKey = <T extends object>(
  resolvePersistentKey?: (item: T) => string
): ((item: T) => string) => {
  const keyMap = new WeakMap<T, string>()
  let keySeed = 0

  return (item: T): string => {
    const persistentKey = resolvePersistentKey ? resolvePersistentKey(item) : ''
    if (persistentKey) {
      return persistentKey
    }

    const existing = keyMap.get(item)
    if (existing) {
      return existing
    }

    const key = `tmp:${keySeed++}`
    keyMap.set(item, key)
    return key
  }
}

export const useRepositoryRowKey = <T extends HasOptionalId>(): ((item: T) => string) => {
  return useStableRowKey<T>((item) => (item.id ? `id:${item.id}` : ''))
}
