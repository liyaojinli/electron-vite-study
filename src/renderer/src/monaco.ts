import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// Configure Monaco Editor environment
// Only use the editor worker for basic editing
// @ts-ignore
self.MonacoEnvironment = {
  getWorker(_: any, _label: string) {
    return new editorWorker()
  }
}

console.log('[Monaco] Environment configured with editor worker')

export default monaco
