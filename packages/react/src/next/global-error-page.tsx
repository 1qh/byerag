'use client'
const GlobalError = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => (
  <html lang='en'>
    <body>
      <div aria-live='assertive' className='flex items-center justify-center min-h-dvh p-6' role='alert'>
        <div className='max-w-sm text-center space-y-3'>
          <h1 className='text-lg font-semibold'>Something went wrong</h1>
          <p className='text-sm text-muted-foreground'>The application encountered an unexpected error.</p>
          <button
            className='px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-accent'
            onClick={() => reset()}
            type='button'>
            Try again
          </button>
          {error.digest ? <p className='text-[10px] text-muted-foreground'>ref: {error.digest}</p> : null}
        </div>
      </div>
    </body>
  </html>
)
export default GlobalError
