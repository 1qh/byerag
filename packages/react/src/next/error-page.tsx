'use client'
import { Button } from '@a/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/components/card'
import { AlertTriangleIcon } from 'lucide-react'
import { useEffect } from 'react'

const ErrorPage = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])
  return (
    <div className='flex items-center justify-center min-h-dvh p-6'>
      <Card className='w-full max-w-md'>
        <CardHeader className='space-y-2 text-center'>
          <div className='mx-auto size-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center'>
            <AlertTriangleIcon className='size-5' />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. If this keeps happening, include the reference below when reporting it.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          <Button className='w-full' onClick={() => reset()}>
            Try again
          </Button>
          {error.digest ? <p className='text-[10px] text-center text-muted-foreground'>ref: {error.digest}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
export default ErrorPage
