import { Repository } from '../../shared/repository'

const saveRepository = (repo: Repository): void => {
  // 这里可以实现将 Repository 对象保存到数据库或文件的逻辑
  console.log('Saving repository:', repo)
}

const loadRepositories = (): Repository[] => {
  // 这里可以实现从数据库或文件加载 Repository 对象的逻辑
  console.log('Loading repositories...')
  return [] // 返回一个 Repository 数组
}

export { saveRepository, loadRepositories }
