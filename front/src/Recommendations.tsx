import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useReducedMotion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon, RefreshIcon, PlayIcon, PauseIcon, ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Button } from './components/ui/button'
import { SourceLogo } from './components/SourceLogo'
import { apiRequest, recommendationRequest } from './lib/api'
import { useSelectedBusinessId } from './lib/business-selection'
import './Recommendations.css'

const labels: Record<string, string> = { politics: 'Политика', economy: 'Экономика', business: 'Бизнес', law: 'Право', society: 'Общество', technology: 'Технологии', science: 'Наука', health: 'Здоровье', environment: 'Экология', culture: 'Культура', sports: 'Спорт', other: 'Другое', none: 'Нет', low: 'Низкий', moderate: 'Умеренный', high: 'Высокий', unclear: 'Неясный' }
type Source = { id: number; source_id: string; source_name: string; source_type: string; title: string; url: string; published_at: string | null }
type Action = { title: string; rationale: string; relevance: string; action: string; service: { id: string; name: string; url: string }; sources: Source[] }
type Data = {
  business: { id: string; industry: string; industry_code: string; news_topics: string[] }
  counterparties: { known_companies: number; unknown_companies: number; known_turnover_share: number | null }
  topics: string[]; sources: { id: string; name: string }[]; candidate_count: number; window_days: number; ai_available: boolean
  news_preview: Source[]
  result: { status: string; recommendations: Action[]; generated_at?: string } | null
}
type Usage = { total_tokens: number; requests: number; input_tokens: number; output_tokens: number; estimated_usd: number | null; estimated_peak_usd: number | null }

export default function Recommendations() {
  const businessId = useSelectedBusinessId()
  const [params] = useSearchParams()
  const filters = new URLSearchParams()
  for (const key of ['topic', 'severity']) if (params.get(key)) filters.set(key, params.get(key)!)
  const query = filters.toString()
  return businessId ? <CompanyRecommendations key={`${businessId}:${query}`} businessId={businessId} query={query} /> : <section className="recommendation-empty"><h1>Рекомендации для бизнеса</h1><p>Выберите компанию в верхней панели. Подберём действия с учётом её отрасли, контрагентов и новостей.</p></section>
}

function CompanyRecommendations({ businessId, query }: { businessId: string; query: string }) {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [usage, setUsage] = useState<Usage | null>(null)
  const alive = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const path = `/api/recommendations${query ? `?${query}` : ''}`
  useEffect(() => {
    alive.current = true
    const abort = new AbortController()
    recommendationRequest<Data>(path, { signal: abort.signal }).then(setData).catch(e => { if (!abort.signal.aborted) setError(e.message) })
    return () => { alive.current = false; abort.abort(); controller.current?.abort() }
  }, [path, retry])
  useEffect(() => {
    const abort = new AbortController()
    apiRequest<{ usage: Usage }>('/api/overview', { signal: abort.signal }).then(value => setUsage(value.usage)).catch(() => {})
    return () => abort.abort()
  }, [data?.result])
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.delete('source')
    if (value) next.set(key, value); else next.delete(key)
    setParams(next)
  }
  async function generate() {
    setBusy(true); setError('')
    controller.current = new AbortController()
    try {
      const next = await recommendationRequest<Data>(path, { method: 'POST', signal: controller.current.signal })
      if (alive.current) { setData(next); requestAnimationFrame(() => resultHeading.current?.focus({ preventScroll: true })) }
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { if (alive.current) setBusy(false) }
  }
  const hasFilters = ['topic', 'severity'].some(k => params.has(k))
  const actions = data?.result?.status === 'ready' ? data.result.recommendations : []
  const stories = actions.length ? [...new Map(actions.flatMap(a => a.sources).map(s => [s.id, s])).values()] : data?.news_preview || []
  return <section className="recommendations" aria-busy={busy}>
    <div className="recommendation-heading"><div><h1>Ньюсрум</h1><p title={data?.business.industry}>{businessId}{data && ` · ${data.business.industry}`}</p></div><Button onClick={generate} disabled={busy || !data || !data.ai_available || data.candidate_count === 0}><HugeiconsIcon icon={RefreshIcon} size={16} aria-hidden="true" />{busy ? 'Подбираем…' : data?.result ? 'Обновить' : 'Подобрать действия'}</Button></div>
    <div className="recommendation-tools"><button onClick={() => window.dispatchEvent(new CustomEvent('alfa-edit-onboarding', { detail: { businessId } }))}>Источники{data ? ` · ${data.sources.length}` : ''}</button><details className="recommendation-filters"><summary>Фильтры{hasFilters ? ' · применены' : ''}</summary><div className="news-filters"><label>Тема<select disabled={busy} value={params.get('topic') || ''} onChange={e => filter('topic', e.target.value)}><option value="">Все подходящие темы</option>{Object.entries(labels).filter(([k]) => !['none','low','moderate','high','unclear'].includes(k)).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Риск новости<select disabled={busy} value={params.get('severity') || ''} onChange={e => filter('severity', e.target.value)}><option value="">Любой уровень</option>{['none','low','moderate','high','unclear'].map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label>{hasFilters && <button disabled={busy} onClick={() => setParams({})}>Сбросить</button>}</div></details></div>
    {error && <div className="notice" role="alert">{error}{!data && <button onClick={() => { setError(''); setRetry(n => n + 1) }}>Повторить</button>}</div>}
    {!data && !error && <p className="recommendation-status" role="status">Подбираем новости для компании…</p>}
    {data && <>
      {!data.ai_available && <p className="recommendation-status">Модель пока не подключена.</p>}
      {busy && <p className="recommendation-status" role="status">Готовим три действия. Обычно это занимает до минуты.</p>}
      <h2 ref={resultHeading} tabIndex={-1} className="bank-sr-only">Рекомендации для компании</h2>
      {data.candidate_count === 0 || data.result?.status === 'insufficient_evidence' ? <div className="recommendation-empty"><h2>Пока мало подходящих новостей</h2><p>Попробуйте другие фильтры или добавьте источники.</p></div> : actions.length ? <div className="recommendation-list">{actions.map(item => <article className="recommendation-card" key={item.service.id}>
        <h2>{item.title}</h2><p className="recommendation-next-step">{item.action}</p>
        <div className="recommendation-card-bottom"><a className="recommendation-service-link" href={item.service.url} target="_blank" rel="noreferrer">{item.service.name}<HugeiconsIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true" /></a><div className="recommendation-source-links">{[...new Map(item.sources.map(s => [s.source_id,s])).values()].map(source => <a key={source.source_id} href={source.url} target="_blank" rel="noreferrer" title={source.title || source.source_name}><SourceLogo id={source.source_id} type={source.source_type} url={source.url} size={14} /><span>{source.source_name}</span></a>)}</div></div>
        <details className="recommendation-explanation"><summary>Почему это важно</summary><p>{item.rationale}</p><p>{item.relevance}</p><ul>{item.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.source_name}</a></li>)}</ul></details>
      </article>)}</div> : !busy && <div className="recommendation-empty"><h2>Что полезно вашему бизнесу?</h2><p>Подберём три действия по новостям из сохранённых источников.</p></div>}
      <NewsStrip stories={stories} supporting={actions.length > 0} />
      <div className="recommendation-footer"><details><summary>О подборе</summary><p>Учитываем отрасль компании, {data.counterparties.known_companies} известных контрагентов и выбранные при настройке источники. Для {data.counterparties.unknown_companies} контрагентов отрасль неизвестна. До 30 материалов за 30 дней. Демо на синтетических профилях; банковские операции не выполняются.</p>{data.result?.generated_at && <p>Обновлено {new Date(data.result.generated_at).toLocaleString('ru-RU')}. Результат сохраняется на час при неизменных данных.</p>}</details>{usage && <details><summary>Расход AI · {usage.total_tokens.toLocaleString('ru-RU')} токенов</summary><p>По всему сервису: вход {usage.input_tokens.toLocaleString('ru-RU')} · выход {usage.output_tokens.toLocaleString('ru-RU')} · запросов {usage.requests.toLocaleString('ru-RU')}{usage.estimated_usd !== null && ` · оценка $${usage.estimated_usd.toFixed(4)}–$${usage.estimated_peak_usd?.toFixed(4)}`}. Включает разметку и рекомендации. Запросы без известного тарифа не включены в стоимость.</p></details>}</div>
    </>}
  </section>
}

function NewsStrip({ stories, supporting }: { stories: Source[]; supporting: boolean }) {
  const strip = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (paused || reducedMotion || stories.length < 2) return
    const timer = window.setInterval(() => {
      const element = strip.current
      const section = element?.closest('section')
      if (!element || !section || document.hidden || section.matches(':hover') || section.contains(document.activeElement)) return
      const bounds = element.getBoundingClientRect()
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return
      const maximum = element.scrollWidth - element.clientWidth
      if (maximum <= 1) return
      const step = (element.firstElementChild?.getBoundingClientRect().width || 270) + 12
      element.scrollTo({ left: element.scrollLeft >= maximum - 2 ? 0 : Math.min(maximum, element.scrollLeft + step), behavior: 'smooth' })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [paused, reducedMotion, stories.length])
  function slide(direction: number) {
    strip.current?.scrollBy({ left: direction * 300, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  if (!stories.length) return null
  return <section className="recommendation-news" aria-label="Подборка новостей"><div className="recommendation-news-heading"><h2>{supporting ? 'В основе рекомендаций' : 'Новости для компании'}</h2><div>{!reducedMotion && stories.length > 1 && <button aria-label={paused ? 'Включить автопрокрутку новостей' : 'Приостановить автопрокрутку новостей'} aria-pressed={paused} onClick={() => setPaused(value => !value)}><HugeiconsIcon icon={paused ? PlayIcon : PauseIcon} size={16} aria-hidden="true" /></button>}<button aria-label="Предыдущие новости" onClick={() => slide(-1)}><HugeiconsIcon icon={ArrowLeft01Icon} size={18} /></button><button aria-label="Следующие новости" onClick={() => slide(1)}><HugeiconsIcon icon={ArrowRight01Icon} size={18} /></button></div></div><div className="recommendation-news-strip" ref={strip} tabIndex={0} role="region" aria-label="Новости — прокрутите горизонтально">{stories.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span className="news-strip-source"><SourceLogo id={source.source_id} type={source.source_type} url={source.url} size={16} />{source.source_name}</span><strong>{source.title || 'Публикация в Telegram'}</strong></a>)}</div></section>
}
