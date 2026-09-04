import type { RenderError } from '../store/types'
import type { Usage } from './openrouter'

export interface Proposal {
  code: string
  /** null when the proposal parses. */
  error: RenderError | null
  applied: boolean
}

export interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Present on assistant replies that contain a diagram. */
  proposal?: Proposal
  usage?: Usage | null
  model?: string
  error?: string
  /** Display name of who sent a user message, in live sessions. */
  author?: string
  /** Who accepted a proposal, in live sessions. */
  appliedBy?: string
  createdAt: number
}

export type KeyStatus = 'none' | 'checking' | 'valid' | 'invalid'
