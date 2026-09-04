const DIAGRAM_START =
  /^\s*(%%\{|flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|gitGraph|journey|quadrantChart|requirementDiagram|C4|sankey|xychart|block|packet|kanban|architecture|zenuml)/

/**
 * Pull the proposed diagram out of a model reply. Prefers the last ```mermaid block,
 * then any fenced block that starts like a diagram, then a bare reply that is itself a diagram.
 */
export function extractMermaidBlock(reply: string): string | null {
  const fences = [...reply.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)]
  const mermaidFences = fences.filter(
    (m) => m[1].toLowerCase() === 'mermaid' || m[1].toLowerCase() === 'mmd',
  )
  const pick = (m: RegExpMatchArray) => m[2].replace(/\s+$/, '') + '\n'

  if (mermaidFences.length) return pick(mermaidFences[mermaidFences.length - 1])
  const diagramLike = fences.filter((m) => DIAGRAM_START.test(m[2]))
  if (diagramLike.length) return pick(diagramLike[diagramLike.length - 1])
  if (!fences.length && DIAGRAM_START.test(reply)) return reply.trim() + '\n'
  return null
}

/** Reply text with the code block removed, for display next to the proposal card. */
export function stripMermaidBlocks(reply: string): string {
  return reply
    .replace(/```[\w-]*[^\n]*\n[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
