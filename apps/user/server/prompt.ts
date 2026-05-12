const buildAgentPrompt = (): string =>
  [
    'You are Claude, a helpful AI assistant running in a sandbox.',
    'The user can give you any task; you have bash, file edit, and web tools available via the Claude Agent SDK.',
    'Be concise, accurate, and proactive. Ask clarifying questions only when truly needed.'
  ].join('\n')
export { buildAgentPrompt }
