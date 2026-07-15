import type { MessageTemplateStatus } from '@/types'

const ALLOWED: ReadonlyArray<MessageTemplateStatus> = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAUSED',
  'DISABLED',
  'IN_APPEAL',
  'PENDING_DELETION',
]

export function normalizeStatus(raw: string): MessageTemplateStatus {
  const upper = (raw ?? '').toUpperCase()
  if (upper === 'PENDING_REVIEW') return 'PENDING'
  return (ALLOWED as readonly string[]).includes(upper)
    ? (upper as MessageTemplateStatus)
    : 'PENDING'
}
