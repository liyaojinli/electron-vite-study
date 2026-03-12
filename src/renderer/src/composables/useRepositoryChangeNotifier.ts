import { emitRepositoriesChanged, type RepositoryChangeScope } from '../utils/repositoryEvents'

export const useRepositoryChangeNotifier = (
  scope: Exclude<RepositoryChangeScope, 'all'>
): (() => void) => {
  return () => {
    emitRepositoriesChanged(scope)
  }
}
