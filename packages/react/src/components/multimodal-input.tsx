/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
/* oxlint-disable promise/prefer-await-to-then */
/** biome-ignore-all lint/a11y/noNoninteractiveElementInteractions: section as drop target is intentional — only used to detect file drag-drop */
'use client'
import type { Status } from '@a/react/hooks'
import { cn } from '@a/ui'
import { PromptInput, PromptInputSubmit, PromptInputTextarea } from '@a/ui/components/ai-elements/prompt-input'
import { Button } from '@a/ui/components/button'
import { InputGroupAddon } from '@a/ui/components/input-group'
import { Paperclip, X } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { MentionItem } from './mention-autocomplete'
import { activeMentionAt } from '../hooks/use-mention-parser'
import { MentionAutocomplete } from './mention-autocomplete'

interface MultimodalInputProps {
  attachments: UploadedFile[]
  focusTick?: number
  hasMessages: boolean
  lockedReason?: null | string
  mentionItems?: MentionItem[]
  onAttachmentsChange: (a: UploadedFile[]) => void
  onChange: (v: string) => void
  onEscape?: () => void
  onFileUpload?: (file: File) => Promise<null | UploadedFile>
  onStop?: () => void
  onSubmit: () => void
  placeholder?: string
  status: Status
  value: string
}
interface UploadedFile {
  filename: string
  storageId: string
}
const PureMultimodalInput = ({
  attachments,
  focusTick,
  hasMessages,
  lockedReason,
  mentionItems,
  onAttachmentsChange,
  onChange,
  onEscape,
  onFileUpload,
  onStop,
  onSubmit,
  placeholder = 'Ask anything…',
  status,
  value
}: MultimodalInputProps) => {
  const isLocked = Boolean(lockedReason)
  const effectivePlaceholder = isLocked ? (lockedReason ?? 'Agent is working…') : placeholder
  const wrapperRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cursor, setCursor] = useState(0)
  useEffect(() => {
    if (focusTick !== undefined && focusTick > 0) {
      textareaRef.current?.focus()
      const el = textareaRef.current
      if (el) {
        el.selectionStart = el.value.length
        el.selectionEnd = el.value.length
      }
    }
  }, [focusTick])
  const active = useMemo(() => (mentionItems ? activeMentionAt(value, cursor) : null), [cursor, mentionItems, value])
  const onSelectMention = (insertText: string): void => {
    if (!active) return
    const next = value.slice(0, active.start) + insertText + value.slice(active.end)
    const newCursor = active.start + insertText.length
    onChange(next)
    globalThis.setTimeout(() => {
      const el = textareaRef.current
      if (el) {
        el.selectionStart = newCursor
        el.selectionEnd = newCursor
        el.focus()
      }
      setCursor(newCursor)
    }, 0)
  }
  const onFocus = (): void => {
    globalThis.setTimeout(() => wrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 250)
  }
  const [dragOver, setDragOver] = useState(false)
  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    if (!onFileUpload) {
      toast.error('File upload not enabled in this app.')
      return
    }
    const fileArr = [...files]
    const results = await Promise.all(fileArr.map(async f => ({ file: f, result: await onFileUpload(f) })))
    const uploaded: UploadedFile[] = []
    for (const r of results)
      if (r.result) uploaded.push(r.result)
      else toast.error(`Failed to upload ${r.file.name}`)
    if (uploaded.length === 0) return
    onAttachmentsChange([...attachments, ...uploaded])
  }
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- container drag-drop zone; the accessible upload path is the file button
    <section
      aria-label='message composer'
      className='relative'
      onDragLeave={() => setDragOver(false)}
      onDragOver={e => {
        if (onFileUpload) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDrop={e => {
        if (!onFileUpload) return
        e.preventDefault()
        setDragOver(false)
        const dropped = e.dataTransfer.files
        handleFiles(dropped).catch(() => null)
      }}
      ref={wrapperRef}>
      {active && mentionItems ? (
        <div className='absolute bottom-full left-0 right-0 mb-2 z-50'>
          <MentionAutocomplete active={active} items={mentionItems} onSelect={onSelectMention} />
        </div>
      ) : null}
      <PromptInput
        className={cn('rounded-xl bg-muted *:rounded-xl', !hasMessages && 'mt-3', dragOver && 'ring-2 ring-primary')}
        onSubmit={(_, e) => {
          e.preventDefault()
          if (isLocked) {
            toast.error(lockedReason ?? 'Agent is working — type "stop" to cancel.')
            return
          }
          if (status === 'ready') {
            if (value.trim() || attachments.length > 0) onSubmit()
          } else toast.error('Please wait for the model to finish its response!')
        }}>
        {attachments.length > 0 ? (
          <div className='flex flex-wrap gap-2 px-3 pt-3'>
            {attachments.map((a, i) => (
              <span
                className='flex max-w-[14rem] items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs'
                key={`${a.storageId}-${a.filename}`}>
                <Paperclip className='size-3 shrink-0 text-muted-foreground' />
                <span className='truncate'>{a.filename}</span>
                <button
                  aria-label={`Remove ${a.filename}`}
                  className='shrink-0 text-muted-foreground hover:text-foreground'
                  onClick={() => onAttachmentsChange(attachments.filter((_, j) => j !== i))}
                  type='button'>
                  <X className='size-3' />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <PromptInputTextarea
          className='mt-0.5 px-4 pt-3 text-base'
          onChange={e => {
            onChange(e.target.value)
            setCursor(e.target.selectionStart)
          }}
          onFocus={onFocus}
          onKeyDown={e => {
            if (e.key === 'Escape' && onEscape) {
              e.preventDefault()
              onEscape()
            }
          }}
          onKeyUp={e => setCursor(e.currentTarget.selectionStart)}
          onMouseUp={e => setCursor(e.currentTarget.selectionStart)}
          placeholder={effectivePlaceholder}
          ref={textareaRef}
          rows={1}
          value={value}
        />
        <InputGroupAddon align='block-end' className='gap-0 px-1.5 pt-0 pb-1'>
          {onFileUpload ? (
            <>
              <input
                accept='.pdf,.docx,.pptx,.xlsx,.epub,.rtf,.md,.txt,.html,.json,.xml,.png,.jpg,.jpeg,.webp,.tiff'
                aria-label='Attach files'
                className='hidden'
                multiple
                onChange={e => {
                  handleFiles(e.target.files).catch(() => null)
                  e.target.value = ''
                }}
                ref={fileInputRef}
                type='file'
              />
              <Button
                aria-label='Attach files'
                className='size-7'
                disabled={isLocked}
                onClick={() => fileInputRef.current?.click()}
                size='icon'
                type='button'
                variant='ghost'>
                <Paperclip className='size-4' />
              </Button>
            </>
          ) : null}
          <p className='grow' />
          {isLocked && onStop ? (
            <Button
              className='h-auto border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10'
              onClick={() => onStop()}
              size='sm'
              type='button'
              variant='ghost'>
              Stop
            </Button>
          ) : null}
          <PromptInputSubmit disabled={isLocked || !value.trim() || status !== 'ready'} status={status} variant='ghost' />
        </InputGroupAddon>
      </PromptInput>
    </section>
  )
}
const MultimodalInput = memo(
  PureMultimodalInput,
  (prev, next) =>
    prev.status === next.status &&
    prev.hasMessages === next.hasMessages &&
    prev.value === next.value &&
    prev.focusTick === next.focusTick &&
    prev.mentionItems === next.mentionItems &&
    prev.lockedReason === next.lockedReason &&
    prev.onEscape === next.onEscape
)
export { MultimodalInput }
