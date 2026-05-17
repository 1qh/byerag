'use client'
import { cn } from '@a/ui'
import { useComposerDraft } from '../../hooks/use-composer-draft'
import { useCountdown } from '../../hooks/use-countdown'
const ACTION_CLASS = 'rounded-md border border-border/60 bg-background/50 px-3 py-1.5 text-xs hover:bg-accent'
interface ConfirmAction {
  label: string
  verb: string
}
interface ConfirmCardProps {
  cancel: ConfirmAction
  confirm: ConfirmAction
  countdownSeconds?: number
  message?: string
  secondaryActions?: ConfirmAction[]
}
const EMPTY_ACTIONS: readonly ConfirmAction[] = []
const ConfirmCard = ({ cancel, confirm, countdownSeconds = 0, message, secondaryActions }: ConfirmCardProps) => {
  const draft = useComposerDraft()
  const countdown = useCountdown(countdownSeconds, () => draft.append(confirm.verb))
  const extras = secondaryActions ?? EMPTY_ACTIONS
  return (
    <div className='flex flex-col gap-2'>
      {countdown.remaining > 0 ? (
        <div className='rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200'>
          Auto-confirming in <span className='font-mono font-bold'>{countdown.remaining}</span>s
          {message ? ` — ${message}` : ' — click Cancel to halt'}
        </div>
      ) : null}
      <div className='flex flex-wrap gap-2'>
        <button
          className={cn(ACTION_CLASS)}
          onClick={() => {
            countdown.cancel()
            draft.append(confirm.verb)
          }}
          type='button'>
          {confirm.label}
        </button>
        <button
          className={cn(ACTION_CLASS)}
          onClick={() => {
            countdown.cancel()
            draft.append(cancel.verb)
          }}
          type='button'>
          {cancel.label}
        </button>
        {extras.map(a => (
          <button
            className={cn(ACTION_CLASS)}
            key={a.verb}
            onClick={() => {
              countdown.cancel()
              draft.append(a.verb)
            }}
            type='button'>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
export { ConfirmCard }
export type { ConfirmAction, ConfirmCardProps }
