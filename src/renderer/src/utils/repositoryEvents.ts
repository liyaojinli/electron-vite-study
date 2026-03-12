type RepositoryChangeScope = 'remote' | 'local' | 'all'

const REPOSITORIES_CHANGED_EVENT = 'repositories:changed'

const emitRepositoriesChanged = (scope: RepositoryChangeScope = 'all'): void => {
  window.dispatchEvent(new CustomEvent<RepositoryChangeScope>(REPOSITORIES_CHANGED_EVENT, { detail: scope }))
}

const onRepositoriesChanged = (
  listener: (scope: RepositoryChangeScope) => void
): (() => void) => {
  const handler: EventListener = (event) => {
    const customEvent = event as CustomEvent<RepositoryChangeScope>
    listener(customEvent.detail || 'all')
  }

  window.addEventListener(REPOSITORIES_CHANGED_EVENT, handler)
  return () => {
    window.removeEventListener(REPOSITORIES_CHANGED_EVENT, handler)
  }
}

export { emitRepositoriesChanged, onRepositoriesChanged }
export type { RepositoryChangeScope }
