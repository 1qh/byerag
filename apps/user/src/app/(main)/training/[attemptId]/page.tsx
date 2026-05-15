'use client'
import { cn } from '@a/ui'
import { api } from 'backend/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { use, useState } from 'react'
interface Snapshot {
  choicesShuffled: string[]
  promptText: string
  questionId: string
}
const AttemptPage = ({ params }: { params: Promise<{ attemptId: string }> }): React.ReactElement => {
  const { attemptId } = use(params)
  const attempt = useQuery(api.trainingAttempts.getMyAttemptDetail, { attemptId: attemptId as never })
  const submit = useMutation(api.trainingAttempts.submitAttempt)
  const [answers, setAnswers] = useState<number[]>([])
  const [submitted, setSubmitted] = useState<null | { passed: boolean; score: number }>(null)
  if (attempt === undefined) return <div className='p-6'>Loading…</div>
  if (attempt === null) return <div className='p-6 text-destructive'>Attempt not found or not yours.</div>
  if ('status' in attempt && attempt.status === 'passed') {
    interface Full {
      questionSnapshots: { choicesShuffled: string[]; correctIndexShuffled: number; promptText: string }[]
      score: number
    }
    const full = attempt as unknown as Full
    return (
      <div className='space-y-4 p-6'>
        <h2 className='font-semibold text-lg text-green-700'>
          Passed — {full.score}/{full.questionSnapshots.length}
        </h2>
        {full.questionSnapshots.map((q, i) => (
          <div className='rounded-md border p-4 space-y-2' key={`${attemptId}-${q.promptText}`}>
            <div className='font-medium'>
              {i + 1}. {q.promptText}
            </div>
            <ol className='list-decimal list-inside text-sm'>
              {q.choicesShuffled.map((c, j) => (
                <li className={cn(j === q.correctIndexShuffled && 'font-semibold text-green-700')} key={c}>
                  {c}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    )
  }
  if ('total' in attempt)
    return (
      <div className='p-6 text-muted-foreground'>
        Score {attempt.score}/{attempt.total} — open-book retake from /training to see content.
      </div>
    )
  interface InProg {
    questionSnapshots: Snapshot[]
    status: string
  }
  const a = attempt as unknown as InProg
  const onPick = (i: number, j: number): void => {
    setAnswers(prev => {
      const n = [...prev]
      n[i] = j
      return n
    })
  }
  const onSubmit = async (): Promise<void> => {
    try {
      const r = await submit({ answers, attemptId: attemptId as never })
      setSubmitted(r)
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('submit failed', error)
    }
  }
  if (submitted)
    return (
      <div className={cn('p-6 font-semibold text-lg', submitted.passed ? 'text-green-700' : 'text-destructive')}>
        {submitted.passed
          ? `✓ Passed (${submitted.score}/${a.questionSnapshots.length})`
          : `✗ Failed (${submitted.score}/${a.questionSnapshots.length}) — retake from /training`}
      </div>
    )
  return (
    <div className='space-y-4 p-6'>
      <h2 className='font-semibold text-lg'>Attempt — {a.questionSnapshots.length} questions</h2>
      {a.questionSnapshots.map((q, i) => (
        <div className='rounded-md border p-4 space-y-2' key={q.questionId}>
          <div className='font-medium'>
            {i + 1}. {q.promptText}
          </div>
          <div className='space-y-1'>
            {q.choicesShuffled.map((c, j) => (
              <label className='flex items-center gap-2 text-sm' key={c}>
                <input checked={answers[i] === j} name={`q${i}`} onChange={() => onPick(i, j)} type='radio' value={j} />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        className='rounded-md border bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50'
        disabled={answers.length !== a.questionSnapshots.length}
        onClick={() => {
          // oxlint-disable-next-line promise/prefer-await-to-then -- React event handler cannot be async (no-misused-promises); .catch is the documented byerag pattern
          onSubmit().catch(() => undefined)
        }}
        type='button'>
        Submit
      </button>
    </div>
  )
}
export default AttemptPage
