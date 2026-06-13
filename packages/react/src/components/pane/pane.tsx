/** biome-ignore-all lint/nursery/noUndeclaredClasses: standard tailwind v4 utilities biome cannot resolve */
'use client'
import type { ReactNode } from 'react'
import { Button } from '@a/ui/components/button'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { OneShotTooltip } from '../one-shot-tooltip'
import { usePane } from './pane-context'

interface PaneProps {
  renderSubject: (kind: string, payload: unknown) => ReactNode
}
const ANIMATE = { opacity: 1, x: 0 }
const EXIT = { opacity: 0, x: 40 }
const INITIAL = { opacity: 0, x: 40 }
const TRANSITION = { duration: 0.22, ease: 'easeOut' as const }
const Pane = ({ renderSubject }: PaneProps) => {
  const { closePane, subject } = usePane()
  return (
    <AnimatePresence>
      {subject ? (
        <motion.aside
          animate={ANIMATE}
          className='fixed inset-0 z-30 flex flex-col bg-background md:relative md:inset-auto md:z-0 md:w-[28rem] md:shrink-0 md:border-l'
          exit={EXIT}
          initial={INITIAL}
          transition={TRANSITION}>
          <header className='flex items-center justify-between border-b px-3 py-2'>
            <div className='flex items-center gap-1 truncate'>
              <Button
                aria-label='back to chat'
                className='size-7 md:hidden'
                onClick={closePane}
                size='icon'
                variant='ghost'>
                <ArrowLeft className='size-4' />
              </Button>
              <span className='truncate text-sm font-medium text-muted-foreground'>{subject.breadcrumb}</span>
            </div>
            <Button
              aria-label='close pane'
              className='hidden size-7 md:inline-flex'
              onClick={closePane}
              size='icon'
              variant='ghost'>
              <X className='size-4' />
            </Button>
          </header>
          <div className='absolute top-12 left-3'>
            <OneShotTooltip storageKey='pane-onboarding-v1'>
              This panel shows what we&apos;re working on. Browse, click, sort — that&apos;s just looking. Want to change
              something? Tell me in chat.
            </OneShotTooltip>
          </div>
          <div className='flex-1 overflow-auto'>{renderSubject(subject.kind, subject.payload)}</div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
export { Pane }
export type { PaneProps }
