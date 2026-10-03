import { describe, expect, it } from 'vitest'
import { ACTIONS } from './registry'
import { conflicts, lookup, parseBinding, resolveBinding } from './keymap'
import { toggleInline } from './markdown-ops'

function event(binding: string): KeyboardEvent {
  const { ctrl, shift, alt, meta, key } = parseBinding(binding)
  const codes: Record<string, string> = { space: 'Space', backslash: 'Backslash', comma: 'Comma', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
  const code = codes[key] ?? (/^\d$/.test(key) ? `Digit${key}` : /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : key)
  const shifted = ')!@#$%^&*('[Number(key)]
  return { ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta, code,
    key: /^\d$/.test(key) && shift ? shifted : key } as KeyboardEvent
}

describe('registered shortcuts', () => {
  it('toggles underline with a closing HTML tag, with and without a selection', () => {
    expect(toggleInline('', 0, 0, '<u>').text).toBe('<u></u>')
    expect(toggleInline('word', 0, 4, '<u>').text).toBe('<u>word</u>')
    expect(toggleInline('<u>word</u>', 3, 7, '<u>').text).toBe('word')
    expect(toggleInline('<u>word</u>', 0, 11, '<u>').text).toBe('word')
  })
  it('resolves every primary and alternative binding as a real physical key, without conflicts', () => {
    expect(conflicts()).toEqual([])
    for (const action of ACTIONS) {
      for (const binding of [action.key, ...(action.altKeys ?? [])]) {
        if (!binding) continue
        expect(resolveBinding(event(binding))?.id, binding).toBe(action.id)
        expect(lookup(binding)?.id).toBe(action.id)
      }
    }
  })

  it('matches punctuation, spaces and shifted digits across keyboard layouts', () => {
    expect(resolveBinding({ ...event('Ctrl+Shift+Digit1'), key: '!' })?.id).toBe('heading.1')
    expect(resolveBinding({ ...event('Ctrl+Backslash'), key: '\\' })?.id).toBe('view.toggleSidebar')
    expect(resolveBinding({ ...event('Ctrl+Shift+Space'), key: ' ' })?.id).toBe('table.select.all')
    expect(resolveBinding({ ...event('Ctrl+,'), key: ',' })?.id).toBe('view.settings')
    expect(resolveBinding({ ...event('Ctrl+Shift+E'), key: 'Process' })?.id).toBe('document.export')
  })
})
