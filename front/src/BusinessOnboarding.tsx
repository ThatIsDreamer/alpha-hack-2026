import { useEffect, useRef, useState, type ReactNode } from 'react'
import { OnboardingIntro } from './components/OnboardingIntro'
import { Mascot } from './components/Mascot'
import { SourceLogo } from './components/SourceLogo'
import { Button } from './components/ui/button'
import { apiRequest } from './lib/api'
import { useSelectedBusinessId } from './lib/business-selection'
import './BusinessOnboarding.css'
import CompanyContextForm, { type CompanyContext } from './CompanyContextForm'

type Source = { id: string; name: string; type: string; enabled: boolean }
type Onboarding = { business_id: string; completed: boolean; source_ids: string[]; sources: Source[] }

export default function BusinessWorkspace({ children }: { children: ReactNode }) {
  const businessId = useSelectedBusinessId()
  return businessId ? <CompanyWorkspace key={businessId} businessId={businessId}>{children}</CompanyWorkspace> : children
}

function CompanyWorkspace({ businessId, children }: { businessId: string; children: ReactNode }) {
  const [data, setData] = useState<Onboarding | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [introComplete, setIntroComplete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [context, setContext] = useState<CompanyContext | null>(null)
  const [editingContext, setEditingContext] = useState(false)
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
    function editContext(event: Event) {
      if ((event as CustomEvent).detail?.businessId === businessId) {
        setEditingContext(true); setError(''); window.scrollTo(0, 0)
      }
    }
    window.addEventListener('alfa-edit-onboarding', edit)
    window.addEventListener('alfa-edit-context', editContext)
    return () => {
      window.removeEventListener('alfa-edit-onboarding', edit)
      window.removeEventListener('alfa-edit-context', editContext)
    }
  }, [businessId])
  useEffect(() => {
    const controller = new AbortController()
    const base = `/api/businesses/${encodeURIComponent(businessId)}`
    Promise.all([
      apiRequest<Onboarding>(`${base}/onboarding`, { signal: controller.signal }),
      apiRequest<CompanyContext>(`${base}/context`, { signal: controller.signal }),
    ]).then(([result, profile]) => { setData(result); setContext(profile); setChosen(result.source_ids); setError(''); setLoading(false) })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false) } })
    return () => controller.abort()
  }, [businessId, retry])
  const showIntro = !!data && !!context && !data.completed && context.status === 'draft' && !introComplete
  const showContext = !showIntro && !!context && (context.status !== 'confirmed' || editingContext)
  const needsOnboarding = !!data && (!data.completed || editing || showContext)
  useEffect(() => { if (needsOnboarding) heading.current?.focus({ preventScroll: true }) }, [needsOnboarding, showContext, showIntro])
  async function saveContext(answers: CompanyContext['answers']) {
    if (!context || busy) return
    setBusy(true); setError('')
    try {
      const saved = await apiRequest<CompanyContext>(`/api/businesses/${encodeURIComponent(businessId)}/context`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: context.version, ...answers }),
      })
      if (!alive.current) return
      setContext(saved); setEditingContext(false)
      window.dispatchEvent(new CustomEvent('alfa-context-saved', { detail: { businessId } }))
      window.scrollTo(0, 0)
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { if (alive.current) setBusy(false) }
  }
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
  if (data?.completed && context?.status === 'confirmed' && !editing && !editingContext) return children
  return <section className="business-onboarding" aria-labelledby="onboarding-title">
    <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1} id="onboarding-title">{showContext ? 'Контекст компании' : data?.completed ? 'Источники новостей' : 'Настроим Ньюсрум'}</h1><p className="onboarding-company">Компания {businessId}{!loading && data && !data.completed && ` · Шаг ${showIntro ? '1' : showContext ? '2' : '3'} из 3`}</p></div>
    {showIntro && <OnboardingIntro onComplete={() => { setIntroComplete(true); window.scrollTo(0, 0) }} />}
    {!showIntro && !showContext && !loading && <div className="onboarding-source-prompt"><Mascot size={64} expression={busy ? 'attentive' : chosen.length ? 'happy' : 'curious-right'} /><p className="onboarding-description">Из каких источников вы хотите получать новости? Выберите хотя бы один, чтобы продолжить.</p></div>}
    {loading && <p role="status" className="onboarding-status">Загружаем настройки компании…</p>}
    {error && <div role="alert" className="onboarding-error"><p>{error}</p><Button variant="secondary" onClick={() => { setLoading(true); setRetry(n => n + 1) }}>Загрузить сохранённые данные</Button></div>}
    {showContext && context && <CompanyContextForm key={`${businessId}:${context.version}`} context={context} busy={busy} onSave={saveContext} onCancel={context.status === 'confirmed' ? () => { setEditingContext(false); setError('') } : undefined} />}
    {!showIntro && !showContext && data && <><div className="onboarding-selection"><span aria-live="polite">Выбрано: {chosen.length}</span><button type="button" disabled={busy} onClick={() => setChosen(data.sources.filter(source => source.enabled).map(source => source.id))}>Выбрать доступные</button><button type="button" disabled={busy || !chosen.length} onClick={() => setChosen([])}>Снять все</button></div>
    <fieldset className="onboarding-sources" disabled={busy}><legend className="bank-sr-only">Предпочитаемые источники новостей</legend>{data.sources.map(source => <label key={source.id} className={`onboarding-source ${chosen.includes(source.id) ? 'is-selected' : ''}`}><input type="checkbox" checked={chosen.includes(source.id)} onChange={() => toggle(source.id)} /><SourceLogo id={source.id} type={source.type} /><span><strong>{source.name}</strong><small>{source.type === 'telegram' ? 'Telegram' : source.type === 'rss' ? 'RSS' : 'Сайт'}{!source.enabled && ' · сбор временно отключён'}</small></span></label>)}</fieldset></>}
    {!showIntro && !showContext && data && <div className="onboarding-footer"><p className="onboarding-note">Рекомендации для этой компании будут учитывать только выбранные доступные источники.</p><div className="onboarding-actions"><Button variant="secondary" onClick={() => { setEditingContext(true); setError('') }} disabled={busy}>Контекст компании</Button>{data.completed && <Button variant="secondary" onClick={() => { setChosen(data.source_ids); setEditing(false); setError('') }} disabled={busy}>Отмена</Button>}<Button onClick={save} disabled={busy || loading || !chosen.length}>{busy ? 'Сохраняем…' : data.completed ? 'Сохранить' : 'Сохранить и продолжить'}</Button></div></div>}
  </section>
}
