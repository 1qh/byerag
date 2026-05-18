'use client'
import type { Id } from 'backend/convex/_generated/dataModel'
import { useChatConvex } from '@a/react/hooks'
import { useDraft } from '@a/react/lib'
import { cn } from '@a/ui'
import { Button } from '@a/ui/components/button'
import dynamic from 'next/dynamic'
import { Source_Serif_4 } from 'next/font/google'
import { useState } from 'react'
import { ChatHeader } from './chat-header'
import { CostIndicator } from './cost-indicator'
import { Messages } from './messages'
import { MultimodalInput } from './multimodal-input'
import { DraftedChips } from './pane/drafted-chips'
import { usePaneOptional } from './pane/pane-context'
const DebugPanel = dynamic(async () => (await import('./debug-panel')).DebugPanel, { ssr: false })
const ExportChat = dynamic(async () => (await import('./export-chat')).ExportChat, { ssr: false })
const emptyTitleFont = Source_Serif_4({ subsets: ['vietnamese'] })
interface ChatProps {
  chatId: Id<'chats'> | null
  emptyTitle?: string
  footerNote?: string
  inputPlaceholder?: string
  lockedReason?: null | string
  mentionItems?: MentionItemLite[]
  onFileUpload?: (file: File) => Promise<null | UploadedFile>
  onStop?: () => void
  prompts?: readonly string[]
}
interface MentionItemLite {
  kind: string
  lastModifiedAt?: number
  name: string
  summary?: string
}
interface UploadedFile {
  filename: string
  storageId: string
}
const EMPTY_PROMPTS: readonly string[] = []
const EMPTY_DRAFTS = [] as const
const Chat = ({
  chatId,
  emptyTitle = 'What can I help with?',
  footerNote = 'AI can make mistakes. Verify important information.',
  inputPlaceholder,
  lockedReason,
  mentionItems,
  onFileUpload,
  onStop,
  prompts = EMPTY_PROMPTS
}: ChatProps) => {
  const {
    activeChatId,
    exportEvents,
    loadMore,
    messages,
    paginationStatus,
    sendMessage,
    state,
    status,
    streamEvents,
    title
  } = useChatConvex({ chatId })
  const id = activeChatId ?? 'new'
  const [value, setValue, clearValue] = useDraft(activeChatId ?? null)
  const [autoFocusTick, setAutoFocusTick] = useState(0)
  const [attachments, setAttachments] = useState<UploadedFile[]>([])
  const pane = usePaneOptional()
  const draftedLines = pane?.draftedLines ?? EMPTY_DRAFTS
  const submit = (): void => {
    const typed = value.trim()
    const drafted = draftedLines.map(d => d.text).join('\n')
    const attachNote =
      attachments.length > 0
        ? `(Files I just attached to my documents — read them with the docs tools in the "mine" scope: ${attachments
            .map(a => a.filename)
            .join(', ')})`
        : ''
    const text = [drafted, typed, attachNote].filter(Boolean).join('\n')
    if (!text) return
    sendMessage(text)
    clearValue()
    setAttachments([])
    if (drafted) pane?.clearDrafts()
  }
  const handleEscape = (): void => {
    if (draftedLines.length > 0) pane?.clearDrafts()
  }
  const handleRemoveDraft = (lineId: string): void => pane?.removeDraft(lineId)
  const fillPrompt = (prompt: string): void => {
    setValue(prompt)
    setAutoFocusTick(n => n + 1)
  }
  const inChat = state.kind !== 'empty'
  const awaitingAssistant = state.kind === 'submitting' || (state.kind === 'streaming' && !state.assistantHasText)
  return (
    <>
      {inChat ? (
        <>
          <ChatHeader chatId={id} />
          {paginationStatus === 'CanLoadMore' ? (
            <Button
              className='w-full text-xs text-muted-foreground hover:text-foreground/70 py-1'
              onClick={() => loadMore(50)}
              type='button'
              variant='ghost'>
              Load older
            </Button>
          ) : null}
          <Messages awaitingAssistant={awaitingAssistant} chatId={activeChatId} messages={messages} status={status} />
        </>
      ) : null}
      <div
        className={cn(
          'm-auto w-full',
          inChat
            ? 'max-w-4xl sticky bottom-0 pb-[env(safe-area-inset-bottom)] bg-background'
            : 'max-w-2xl gap-2 px-2 pb-0.5'
        )}>
        {inChat ? null : (
          <p className={cn('mb-6 text-center text-5xl font-light tracking-tighter', emptyTitleFont.className)}>
            {emptyTitle}
          </p>
        )}
        {pane && draftedLines.length > 0 ? <DraftedChips lines={draftedLines} onRemove={handleRemoveDraft} /> : null}
        <MultimodalInput
          attachments={attachments}
          focusTick={autoFocusTick}
          hasMessages={inChat}
          lockedReason={lockedReason}
          mentionItems={mentionItems}
          onAttachmentsChange={setAttachments}
          onChange={setValue}
          onEscape={handleEscape}
          onFileUpload={onFileUpload}
          onStop={onStop}
          onSubmit={submit}
          placeholder={inputPlaceholder}
          status={status}
          value={value}
        />
        {inChat || prompts.length === 0 ? null : (
          <div className='mt-3 flex flex-wrap justify-center gap-1.5 px-2'>
            {prompts.map(prompt => (
              <Button
                className='max-w-full rounded-full border border-border/60 bg-background/50 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border transition truncate'
                key={prompt}
                onClick={() => fillPrompt(prompt)}
                title={prompt}
                type='button'
                variant='ghost'>
                {prompt}
              </Button>
            ))}
          </div>
        )}
        {inChat ? (
          <div className='bg-background flex items-center justify-between gap-3 pl-2'>
            <p className='text-xs font-light tracking-tight text-muted-foreground'>{footerNote}</p>
            <div className='flex items-center gap-3'>
              <CostIndicator events={streamEvents} />
              <ExportChat events={exportEvents} title={title} />
            </div>
          </div>
        ) : null}
        {inChat ? (
          <div className='max-h-64 overflow-auto' data-verbose='debug'>
            <DebugPanel events={streamEvents} sendTime={null} />
          </div>
        ) : null}
      </div>
    </>
  )
}
export { Chat }
