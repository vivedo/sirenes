import { useEffect, useState } from 'react'
import { openDroppedItem } from '../documents/actions'
import { isSupportedFileName } from '../storage/types'
import { toast } from '../store/toastStore'

/** Whole-window drop target for diagram files. */
export function DropZone() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setActive(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setActive(false)
      const item = e.dataTransfer?.items?.[0] ?? null
      const file = e.dataTransfer?.files?.[0] ?? null
      if (!file) return
      if (!isSupportedFileName(file.name)) {
        toast.error(`Unsupported file type: ${file.name}`)
        return
      }
      void openDroppedItem(item, file)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!active) return null
  return (
    <div className="dropzone" role="status" data-testid="dropzone">
      <div className="dropzone-card">Drop a .mmd, .mermaid or .md file to open it</div>
    </div>
  )
}
