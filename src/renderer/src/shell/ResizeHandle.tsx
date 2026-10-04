import { t } from '../i18n'
import { useEffect, useRef, type PointerEvent } from 'react'
import { DEFAULT_SETTINGS } from '@shared/types'
import { usePatchSettings, useSettings } from '../state/settings'

interface Props { side: 'left' | 'right' }

export function ResizeHandle({ side }: Props): JSX.Element {
  const settings = useSettings()
  const patch = usePatchSettings()
  const setting = side === 'left' ? 'sidebarWidth' : 'historyWidth'
  const variable = side === 'left' ? '--sidebar-w' : '--history-w'
  const direction = side === 'left' ? 1 : -1
  const drag = useRef<{ x: number; width: number; next: number } | null>(null)
  const limits = (): [number, number] => {
    const style = getComputedStyle(document.documentElement)
    return [parseFloat(style.getPropertyValue('--side-panel-min-w')),
      Math.min(parseFloat(style.getPropertyValue('--side-panel-max-w')), Math.floor(window.innerWidth * 0.35))]
  }
  const clamp = (width: number): number => {
    const [min, max] = limits()
    return Math.round(Math.max(min, Math.min(max, width)))
  }
  const [minWidth, maxWidth] = limits()
  const finish = (): void => {
    if (!drag.current) return
    const width = drag.current.next
    drag.current = null
    delete document.documentElement.dataset.resizing
    patch({ [setting]: width })
  }
  useEffect(() => () => {
    if (drag.current) delete document.documentElement.dataset.resizing
  }, [])

  const start = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const width = event.currentTarget.parentElement!.getBoundingClientRect().width
    drag.current = { x: event.clientX, width, next: width }
    document.documentElement.dataset.resizing = 'true'
  }

  return <div className={`side-resizer side-resizer--${side}`} role="separator" tabIndex={0}
    aria-label={side === 'left' ? t('调整导航栏宽度') : t('调整历史栏宽度')} aria-orientation="vertical"
    aria-valuenow={Math.min(maxWidth, settings[setting])} aria-valuemin={minWidth} aria-valuemax={maxWidth}
    onPointerDown={start}
    onPointerMove={(event) => {
      if (!drag.current) return
      const width = clamp(drag.current.width + direction * (event.clientX - drag.current.x))
      drag.current.next = width
      document.documentElement.style.setProperty(variable, `${width}px`)
      event.currentTarget.setAttribute('aria-valuenow', String(width))
    }}
    onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
    onLostPointerCapture={finish}
    onDoubleClick={() => patch({ [setting]: DEFAULT_SETTINGS[setting] })}
    onKeyDown={(event) => {
      // Standard separator navigation, kept local like native range controls.
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const [min, max] = limits()
      const width = event.key === 'Home' ? min : event.key === 'End' ? max
        : settings[setting] + (event.key === 'ArrowRight' ? 16 : -16) * direction
      patch({ [setting]: clamp(width) })
    }} />
}
