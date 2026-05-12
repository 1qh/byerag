#!/usr/bin/env bun
import { runSmoke } from '@a/react/smoke'
await runSmoke({
  app: 'admin',
  assert: ({ all }) => all.includes('pong'),
  failureHint: 'agent did not echo PONG',
  prompt: 'Echo the literal word PONG. Do not do anything else.'
})
