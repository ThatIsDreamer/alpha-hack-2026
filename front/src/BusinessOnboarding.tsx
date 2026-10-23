import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { TelegramIcon, RssIcon, Globe02Icon } from '@hugeicons/core-free-icons'
import { Button } from './components/ui/button'
import { apiRequest } from './lib/api'
import { useSelectedBusinessId } from './lib/business-selection'
import './BusinessOnboarding.css'

type Source = { id: string; name: string; type: string; enabled: boolean }
type Onboarding = { business_id: string; completed: boolean; source_ids: string[]; sources: Source[] }

export default function BusinessWorkspace({ children }: { children: ReactNode }) {
  const businessId = useSelectedBusinessId()
  return businessId ? <CompanyWorkspace key={businessId} businessId={businessId}>{children}</CompanyWorkspace> : children
}

function CompanyWorkspace({ businessId, children }: { businessId: string; children: ReactNode }) {
  const [data, setData] = useState<Onboarding | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const alive = useRef(true)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    function edit(event: Event) {
      if ((event as CustomEvent).detail?.businessId === businessId) {
        setEditing(true); setError(''); window.scrollTo(0, 0)
      }
    }
    window.addEventListener('alfa-edit-onboarding', edit)
    return () => window.removeEventListener('alfa-edit-onboarding', edit)
  }, [businessId])
  useEffect(() => {
    const controller = new AbortController()
    apiRequest<Onboarding>(`/api/businesses/${encodeURIComponent(businessId)}/onboarding`, { signal: controller.signal })
      .then(result => { setData(result); setChosen(result.source_ids); setError(''); setLoading(false) })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false) } })
    return () => controller.abort()
  }, [businessId, retry])
  const needsOnboarding = !!data && (!data.completed || editing)
  useEffect(() => { if (needsOnboarding) heading.current?.focus({ preventScroll: true }) }, [needsOnboarding])
  async function save() {
    if (!chosen.length || !data) return
    setBusy(true); setError('')
    try {
      await apiRequest(`/api/businesses/${encodeURIComponent(businessId)}/onboarding`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_ids: chosen }),
      })
      if (!alive.current) return
      setData({ ...data, completed: true, source_ids: chosen }); setEditing(false)
      window.dispatchEvent(new CustomEvent('alfa-onboarding-saved', { detail: { businessId } }))
      window.scrollTo(0, 0)
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true })
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally { if (alive.current) setBusy(false) }
  }
  function toggle(id: string) { setChosen(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]) }
  if (data?.completed && !editing) return children
  return <section className="business-onboarding" aria-labelledby="onboarding-title">
    <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1} id="onboarding-title">{data?.completed ? 'Источники новостей' : 'Настроим Ньюсрум'}</h1><p className="onboarding-company">Компания {businessId}</p></div>
    <p className="onboarding-description">Из каких источников вы хотите получать новости? Выберите хотя бы один, чтобы продолжить.</p>
    {loading && <p role="status" className="onboarding-status">Загружаем источники…</p>}
    {error && <div role="alert" className="onboarding-error"><p>{error}</p>{!data && <Button variant="secondary" onClick={() => { setLoading(true); setRetry(n => n + 1) }}>Повторить</Button>}</div>}
    {data && <><div className="onboarding-selection"><span aria-live="polite">Выбрано: {chosen.length}</span><button type="button" disabled={busy} onClick={() => setChosen(data.sources.filter(source => source.enabled).map(source => source.id))}>Выбрать доступные</button><button type="button" disabled={busy || !chosen.length} onClick={() => setChosen([])}>Снять все</button></div>
    <fieldset className="onboarding-sources" disabled={busy}><legend className="bank-sr-only">Предпочитаемые источники новостей</legend>{data.sources.map(source => <label key={source.id} className={`onboarding-source ${chosen.includes(source.id) ? 'is-selected' : ''}`}><input type="checkbox" checked={chosen.includes(source.id)} onChange={() => toggle(source.id)} /><HugeiconsIcon icon={source.type === 'telegram' ? TelegramIcon : source.type === 'rss' ? RssIcon : Globe02Icon} size={18} strokeWidth={1.6} aria-hidden="true" /><span><strong>{source.name}</strong><small>{source.type === 'telegram' ? 'Telegram' : source.type === 'rss' ? 'RSS' : 'Сайт'}{!source.enabled && ' · сбор временно отключён'}</small></span></label>)}</fieldset></>}
    <div className="onboarding-footer"><p className="onboarding-note">Сохраним выбор для этой компании. Пока он не меняет ленту новостей.</p><div className="onboarding-actions">{data?.completed && <Button variant="secondary" onClick={() => { setChosen(data.source_ids); setEditing(false); setError('') }} disabled={busy}>Отмена</Button>}<Button onClick={save} disabled={busy || loading || !data || !chosen.length}>{busy ? 'Сохраняем…' : data?.completed ? 'Сохранить' : 'Сохранить и продолжить'}</Button></div></div>
  </section>
}
