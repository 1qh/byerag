const errorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'data' in e) return String(e.data)
  return String(e)
}
export { errorMessage }
