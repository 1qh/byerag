import { describe, expect, test } from 'bun:test'
import { parseStdout, parseToolPath } from './tool-parse'

describe('parseStdout', () => {
  test('null when input missing', () => {
    expect(parseStdout(undefined)).toBe(null)
    expect(parseStdout('')).toBe(null)
  })
  test('parses JSON from string', () => {
    expect(parseStdout('{"a":1}')).toEqual({ a: 1 })
  })
  test('parses JSON from content-array (Anthropic tool-result shape)', () => {
    const content = [
      { text: '{"k":', type: 'text' },
      { text: '"v"}', type: 'text' }
    ]
    expect(parseStdout(content)).toEqual({ k: 'v' })
  })
  test('non-json text → null', () => {
    expect(parseStdout('hello world')).toBe(null)
  })
})
describe('parseToolPath', () => {
  test('null when no command', () => {
    expect(parseToolPath(undefined)).toBe(null)
    expect(parseToolPath({ command: 'ls' })).toBe(null)
  })
  test('parses "x <provider> <tool>"', () => {
    expect(parseToolPath({ command: 'x provider tool' })).toEqual(['provider', 'tool'])
  })
  test('parses nested subcommand', () => {
    expect(parseToolPath({ command: 'x provider group subcommand' })).toEqual(['provider', 'group', 'subcommand'])
  })
  test('strips --flags from token list', () => {
    expect(parseToolPath({ command: 'x p t --flag more' })).toEqual(['p', 't', 'more'])
  })
  test('stops at --help', () => {
    expect(parseToolPath({ command: 'x p --help' })).toEqual(['p'])
  })
  test('accepts bunx prefix', () => {
    expect(parseToolPath({ command: 'bunx x p t' })).toEqual(['p', 't'])
  })
  test('rejects non-kebab tokens (mixed case)', () => {
    expect(parseToolPath({ command: 'x p Tool' })).toEqual(['p'])
  })
  test('caps at 3 subcommands', () => {
    expect(parseToolPath({ command: 'x p a b c d e' })).toEqual(['p', 'a', 'b', 'c'])
  })
  test('parses bare invocation without x prefix (provider as standalone binary)', () => {
    expect(parseToolPath({ command: 'demo movies popular --limit 10' })).toEqual(['demo', 'movies', 'popular'])
    expect(parseToolPath({ command: 'demo search multi --query=q' })).toEqual(['demo', 'search', 'multi'])
  })
})
