import type { StorageProvider } from '../types'
import { fsaProvider, supportsFileSystemAccess } from './fsaProvider'
import { fallbackProvider } from './fallbackProvider'

export { supportsFileSystemAccess, openFromHandle, NoHandleError } from './fsaProvider'
export { openFromFile } from './fallbackProvider'

export function getLocalProvider(): StorageProvider {
  return supportsFileSystemAccess() ? fsaProvider : fallbackProvider
}
