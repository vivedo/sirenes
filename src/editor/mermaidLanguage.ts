import { StreamLanguage, type StringStream } from '@codemirror/language'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const DIAGRAM_TYPES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitGraph',
  'journey',
  'quadrantChart',
  'requirementDiagram',
  'C4Context',
  'C4Container',
  'C4Component',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'kanban',
  'architecture-beta',
  'zenuml',
]

const KEYWORDS = [
  // flowchart
  'subgraph',
  'end',
  'direction',
  'TB',
  'TD',
  'BT',
  'RL',
  'LR',
  'click',
  'style',
  'classDef',
  'class',
  'linkStyle',
  // sequence
  'participant',
  'actor',
  'activate',
  'deactivate',
  'loop',
  'alt',
  'else',
  'opt',
  'par',
  'and',
  'critical',
  'option',
  'break',
  'rect',
  'note',
  'Note',
  'over',
  'left',
  'right',
  'of',
  'autonumber',
  'box',
  'as',
  'create',
  'destroy',
  'links',
  'link',
  // class / state
  'namespace',
  'state',
  'interface',
  'enum',
  'abstract',
  'service',
  'callback',
  'cssClass',
  // gantt
  'title',
  'dateFormat',
  'axisFormat',
  'tickInterval',
  'excludes',
  'includes',
  'todayMarker',
  'section',
  'done',
  'active',
  'crit',
  'milestone',
  'after',
  'until',
  // pie / misc
  'showData',
  'accTitle',
  'accDescr',
  // git
  'commit',
  'branch',
  'checkout',
  'switch',
  'merge',
  'cherry-pick',
  'id',
  'tag',
  'type',
  'order',
  // mindmap / timeline
  'root',
  // er
  'PK',
  'FK',
  'UK',
  // xychart
  'x-axis',
  'y-axis',
  'bar',
  'line',
]

const keywordSet = new Set(KEYWORDS)
const diagramSet = new Set(DIAGRAM_TYPES)

const ARROWS = [
  // flowchart
  '-->',
  '---',
  '-.->',
  '-.-',
  '==>',
  '===',
  '--x',
  'x--',
  '--o',
  'o--',
  '<-->',
  '<--',
  '<==>',
  '<==',
  '-->|',
  '~~~',
  // sequence
  '->>',
  '-->>',
  '<<->>',
  '<<-->>',
  '-x',
  '--x',
  '-)',
  '--)',
  '->',
  '<-',
  // class / er
  '<|--',
  '<|..',
  '*--',
  'o--',
  '--*',
  '--o',
  '..|>',
  '--|>',
  '..>',
  '..',
  '<..',
  '|>',
  '||--',
  '||..',
  '}o--',
  '}|--',
  'o{',
  '|{',
  '|o',
  '||',
  '}|',
  '}o',
  'o|',
  '--||',
  '--o{',
  '--|{',
  // misc
  '::',
  ':::',
  '=>',
  '<=',
]
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Longest first so the alternation prefers "-->>" over "-->".
const ARROW = new RegExp(
  '^(' +
    [...new Set(ARROWS)]
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join('|') +
    ')',
)

const HYPHENATED = new RegExp(
  '^(' +
    [...DIAGRAM_TYPES, ...KEYWORDS]
      .filter((w) => w.includes('-'))
      .sort((a, b) => b.length - a.length)
      .join('|') +
    ')(?![\\w-])',
)

interface State {
  inDirective: boolean
}

const tokenizer = {
  startState(): State {
    return { inDirective: false }
  },
  token(stream: StringStream, state: State): string | null {
    if (state.inDirective) {
      if (stream.match(/^.*?\}%%/)) state.inDirective = false
      else stream.skipToEnd()
      return 'meta'
    }
    if (stream.eatSpace()) return null

    // %%{init: ...}%% directive vs %% comment
    if (stream.match('%%{')) {
      if (!stream.match(/^.*?\}%%/)) state.inDirective = true
      return 'meta'
    }
    if (stream.match('%%')) {
      stream.skipToEnd()
      return 'comment'
    }

    // Strings
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string'
    if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string'
    if (stream.match(/^`[^`]*`?/)) return 'string'

    // Arrows and relationship operators
    if (stream.match(ARROW)) return 'operator'

    // Brackets and shapes
    if (
      stream.match(/^(\(\(\(|\)\)\)|\(\(|\)\)|\(\[|\]\)|\[\[|\]\]|\[\(|\)\]|\{\{|\}\}|>|[[\](){}])/)
    )
      return 'bracket'

    // Numbers and dates
    if (stream.match(/^\d{4}-\d{2}-\d{2}/)) return 'number'
    if (stream.match(/^\d+(\.\d+)?[a-z%]*/)) return 'number'

    // Hyphenated keywords must be matched before plain words so hyphens stay available for arrows.
    if (stream.match(HYPHENATED)) return 'keyword'

    // Words
    if (stream.match(/^[A-Za-z_]\w*/)) {
      const word = stream.current()
      if (diagramSet.has(word) || keywordSet.has(word)) return 'keyword'
      return 'variableName'
    }

    stream.next()
    return null
  },
}

export const mermaidLanguage = StreamLanguage.define<State>(tokenizer)

export const mermaidHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-keyword)', fontWeight: '600' },
  { tag: t.string, color: 'var(--syn-string)' },
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.operator, color: 'var(--syn-arrow)' },
  { tag: t.bracket, color: 'var(--syn-bracket)' },
  { tag: t.meta, color: 'var(--syn-directive)' },
  { tag: t.number, color: 'var(--syn-number)' },
  { tag: t.variableName, color: 'var(--fg)' },
])

export function mermaid() {
  return [mermaidLanguage, syntaxHighlighting(mermaidHighlightStyle)]
}
