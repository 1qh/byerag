/* eslint-disable @typescript-eslint/no-unnecessary-condition */
'use client'
import { CitationAnchor } from '@a/react/components'
import { cn } from '@a/ui'
import { Button, buttonVariants } from '@a/ui/components/button'
import { Label } from '@a/ui/components/label'
import { Progress } from '@a/ui/components/progress'
import { RadioGroup, RadioGroupItem } from '@a/ui/components/radio-group'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import Link from 'next/link'
import { use, useState } from 'react'
import { toast } from 'sonner'

interface Snapshot {
  choicesShuffled: string[]
  promptText: string
  questionId: string
}
interface Terminal {
  passed: boolean
  score: number
  sources: { docId: string; filename: string }[]
  total: number
}
const Sources = ({ sources }: { sources: { docId: string; filename: string }[] }): null | React.ReactElement => {
  if (sources.length === 0) return null
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <span className='text-muted-foreground text-sm'>Sources:</span>
      {sources.map(s => (
        <CitationAnchor href={`/docs/${s.docId}`} key={s.docId}>
          {s.filename}
        </CitationAnchor>
      ))}
    </div>
  )
}
const AttemptPage = ({ params }: { params: Promise<{ attemptId: string }> }): React.ReactElement => {
  const { attemptId } = use(params)
  const attempt = useQuery(api.trainingAttempts.getMyAttemptDetail, { attemptId: attemptId as never })
  const submit = useMutation(api.trainingAttempts.submitAttempt)
  const [answers, setAnswers] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  if (attempt === undefined) return <p className='p-6'>Loading…</p>
  if (attempt === null) return <p className='p-6 text-destructive'>Attempt not found or not yours.</p>
  if ('passed' in attempt) {
    const a = attempt as Terminal
    return (
      <div className='mx-auto max-w-xl space-y-6 p-6'>
        <hgroup className='space-y-1'>
          <h1 className={cn('font-bold text-2xl', a.passed ? 'text-green-700' : 'text-destructive')}>
            {a.passed ? 'Passed ✓' : 'Not passed'}
          </h1>
          <p className='text-muted-foreground'>
            Score {a.score}/{a.total}
            {a.passed ? '' : ' — review the source documents below and try again.'}
          </p>
        </hgroup>
        <Sources sources={a.sources} />
        {a.passed ? null : (
          <Link className={cn(buttonVariants({ variant: 'secondary' }))} href='/training'>
            Back to training
          </Link>
        )}
      </div>
    )
  }
  const a = attempt as unknown as { questionSnapshots: Snapshot[] }
  const onPick = (i: number, j: number): void =>
    setAnswers(prev => {
      const n = [...prev]
      n[i] = j
      return n
    })
  const onSubmit = async (): Promise<void> => {
    setSubmitting(true)
    try {
      await submit({ answers, attemptId: attemptId as never })
      // Status flips → getMyAttemptDetail re-renders the terminal result
    } catch (error: unknown) {
      toast.error(`Could not submit: ${String(error).slice(0, 120)}`)
      setSubmitting(false)
    }
  }
  // oxlint-disable-next-line no-unnecessary-condition
  const allAnswered = answers.length === a.questionSnapshots.length && answers.every(v => v !== undefined)
  const total = a.questionSnapshots.length
  const answered = answers.filter(v => v !== undefined).length
  return (
    <div className='mx-auto max-w-2xl space-y-4 p-6'>
      <div className='sticky top-0 z-10 space-y-2 border-b bg-background pt-2 pb-3'>
        <div className='flex items-center justify-between'>
          <h2 className='font-semibold text-lg'>
            Question {Math.min(answered + 1, total)} of {total}
          </h2>
          <span className='text-muted-foreground text-sm tabular-nums'>
            {answered}/{total} answered
          </span>
        </div>
        <Progress value={(answered / total) * 100} />
      </div>
      {a.questionSnapshots.map((q, i) => (
        <div className='space-y-2 rounded-md border p-4' key={q.questionId}>
          <p className='font-medium'>
            {i + 1}. {q.promptText}
          </p>
          <RadioGroup
            className='space-y-1'
            onValueChange={v => onPick(i, Number(v))}
            value={answers[i] === undefined ? null : String(answers[i])}>
            {q.choicesShuffled.map((c, j) => (
              <Label className='text-sm' key={c}>
                <RadioGroupItem value={String(j)} />
                {c}
              </Label>
            ))}
          </RadioGroup>
        </div>
      ))}
      <Button
        disabled={!allAnswered || submitting}
        onClick={() => {
          // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- React handler
          onSubmit().catch((error: unknown) => toast.error(String(error)))
        }}>
        {submitting ? 'Submitting…' : 'Submit'}
      </Button>
    </div>
  )
}
export default AttemptPage
