import type { ChatMessage } from './openrouter'
import type { RenderError } from '../store/types'

export type PromptMode = 'edit' | 'explain'

export const SYSTEM_PROMPT = `You are Sirenes, an assistant that edits Mermaid diagrams.

Rules:
- When asked to change, create, fix, simplify or convert a diagram, reply with the COMPLETE updated Mermaid source in exactly one fenced code block tagged \`mermaid\`. Never reply with a partial diagram or a diff.
- Preserve everything the user did not ask to change: node ids, labels, ordering, comments, styling and %%{init}%% directives.
- Keep a short explanation (one or two sentences) before the code block only if it adds information. No explanation after the block.
- Only output valid Mermaid syntax for the diagram type in use. Do not invent syntax. Do not wrap the diagram in HTML or Markdown headings.
- When asked to explain a diagram, answer in plain prose and do not include a code block unless the user also asked for changes.
- If the request is ambiguous, make the most reasonable choice and state the assumption briefly.`

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface BuildPromptInput {
  source: string
  request: string
  mode: PromptMode
  history: HistoryTurn[]
  error?: RenderError | null
  /** How many prior turns to include. */
  maxHistory?: number
}

function fence(code: string) {
  return '```mermaid\n' + code.replace(/\n$/, '') + '\n```'
}

/** Assemble the message list for one request. */
export function buildMessages(input: BuildPromptInput): ChatMessage[] {
  const history = input.history.slice(-(input.maxHistory ?? 8))
  const parts: string[] = []

  if (input.source.trim()) {
    parts.push('Current diagram:\n' + fence(input.source))
  } else {
    parts.push('The editor is currently empty.')
  }
  if (input.error) {
    parts.push(
      `The current diagram fails to parse${input.error.line ? ` on line ${input.error.line}` : ''}: ${input.error.message}`,
    )
  }
  parts.push(
    input.mode === 'explain'
      ? `Explain, in prose: ${input.request}`
      : `Request: ${input.request}\n\nReply with the complete updated diagram in one \`\`\`mermaid block.`,
  )

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
    { role: 'user', content: parts.join('\n\n') },
  ]
}

export interface Preset {
  id: string
  label: string
  mode: PromptMode
  /** Build the request text. `arg` is used by parameterised presets like "Convert to". */
  request: (ctx: { hasError: boolean; arg?: string }) => string
  needsInput?: boolean
}

export const CONVERT_TARGETS = [
  'flowchart',
  'sequence diagram',
  'class diagram',
  'state diagram',
  'ER diagram',
  'mind map',
  'timeline',
]

export const PRESETS: Preset[] = [
  {
    id: 'fix',
    label: 'Fix syntax',
    mode: 'edit',
    request: ({ hasError }) =>
      hasError
        ? 'Fix the syntax error so the diagram parses, changing as little as possible.'
        : 'Check the diagram for syntax problems and fix any you find, changing as little as possible.',
  },
  {
    id: 'explain',
    label: 'Explain',
    mode: 'explain',
    request: () =>
      'What does this diagram describe? Summarise the flow and call out anything unclear.',
  },
  {
    id: 'simplify',
    label: 'Simplify',
    mode: 'edit',
    request: () =>
      'Simplify this diagram: merge redundant nodes, shorten labels, and remove clutter while keeping its meaning.',
  },
  {
    id: 'tidy',
    label: 'Tidy layout',
    mode: 'edit',
    request: () =>
      'Improve readability: consistent indentation, sensible direction, grouped related nodes, clearer labels. Do not change the meaning.',
  },
  {
    id: 'convert',
    label: 'Convert to…',
    mode: 'edit',
    request: ({ arg }) =>
      `Convert this diagram to a ${arg ?? 'flowchart'}, preserving all the information it carries.`,
  },
]
