import { t } from '../i18n'
import { useEffect, useRef, type PointerEvent } from 'react'
import { DEFAULT_SETTINGS } from '@shared/types'
import { usePatchSettings, useSettings } from '../state/settings'

type Side = 'left' | 'right'
const settingFor = (side: Side) => side === 'left' ? 'pageMarginLeft' : 'pageMarginRight'
const clamp = (value: number): number => Math.max(0, Math.min(35, value))

export function PageMargins(): JSX.Element {
  const settings = useSettings()
  const patch = usePatchSettings()
  const drag = useRef<{ side: Side; x: number; start: number; width: number; next: number } | null>(null)
  const finish = (): void => {
    if (!drag.current) return
    const { side, next } = drag.current
    drag.current = null
    delete document.documentElement.dataset.resizing
    patch({ [settingFor(side)]: next })
  }
  useEffect(() => () => { delete document.documentElement.dataset.resizing }, [])

  const start = (event: PointerEvent<HTMLDivElement>, side: Side): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const surface = event.currentTarget.parentElement!
    const width = surface.querySelector('.cm-scroller')!.clientWidth
    const style = getComputedStyle(surface.querySelector('.cm-content')!)
    const margin = parseFloat(side === 'left' ? style.paddingLeft : style.paddingRight) / width * 100
    drag.current = { side, x: event.clientX, start: margin, width, next: margin }
    document.documentElement.dataset.resizing = 'true'
  }

  return <>{(['left', 'right'] as const).map(side => <div key={side}
    className={`page-margin page-margin--${side}`} role="separator" tabIndex={0}
    aria-label={t('调整正文{0}边距', side === 'left' ? t('左') : t('右'))} aria-orientation="vertical"
    aria-valuemin={0} aria-valuemax={35} aria-valuenow={settings[settingFor(side)]}
    aria-valuetext={`${settings[settingFor(side)]}%`}
    title={t('拖动调整正文边距，双击恢复默认')}
    onPointerDown={event => start(event, side)}
    onPointerMove={event => {
      if (!drag.current) return
      const { x, width, start } = drag.current
      const next = Math.round(clamp(start + (event.clientX - x) * (side === 'left' ? 1 : -1) / width * 100) * 10) / 10
      drag.current.next = next
      document.documentElement.style.setProperty(`--page-margin-${side}`, `${next}%`)
      event.currentTarget.setAttribute('aria-valuenow', String(next))
      event.currentTarget.setAttribute('aria-valuetext', `${next}%`)
    }}
    onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
    onLostPointerCapture={finish}
    onDoubleClick={() => patch({ [settingFor(side)]: DEFAULT_SETTINGS[settingFor(side)] })}
    onKeyDown={event => {
      // Native separator navigation also makes the drag control keyboard-accessible.
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 35
        : settings[settingFor(side)] + (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1)
      patch({ [settingFor(side)]: clamp(next) })
    }} />)}</>
}
