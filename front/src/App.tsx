import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useParams, useSearchParams, useNavigate, useLocation } from 'react-router'
import './App.css'
import BankMock from './BankMock'
import Recommendations from './Recommendations'
import MascotDemo from './MascotDemo'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon, ArrowLeft01Icon, ArrowRight01Icon, PlayIcon } from '@hugeicons/core-free-icons'
import { Button } from './components/ui/button'
import './Newsroom.css'
import { apiRequest } from './lib/api'
import { SourceLogo } from './components/SourceLogo'

const labels: Record<string,string> = { politics: 'Политика', economy: 'Экономика', business: 'Бизнес', law: 'Право', society: 'Общество', technology: 'Технологии', science: 'Наука', health: 'Здоровье', environment: 'Экология', culture: 'Культура', sports: 'Спорт', other: 'Другое', none: 'Нет', low: 'Низкий', moderate: 'Умеренный', high: 'Высокий', unclear: 'Неясно' }
function request<T>(path: string, method = 'GET'): Promise<T> {
  return apiRequest<T>(path, { method })
}
function useData<T>(path: string, refresh = 0) {
  const [state, setState] = useState<{ path: string; data: T | null; error: string }>({ path: '', data: null, error: '' })
  useEffect(() => {
    let active = true
    request<T>(path).then(data => { if (active) setState({ path, data, error: '' }) }).catch(e => { if (active) setState({ path, data: null, error: e.message }) })
    return () => { active = false }
  }, [path, refresh])
  return state.path === path ? state : { data: null, error: '' }
}

type Usage = { estimated_usd: number | null; estimated_peak_usd: number | null; unpriced_requests: number; requests: number; input_tokens: number; output_tokens: number; total_tokens: number; unknown_requests: number; since: string | null }
type News = { source_type: string; source_name: string; source_channel: string | null; id: number; title: string; source_id: string; url: string; excerpt: string; text: string; status: string; topic: string | null; severity: string | null; published_at: string | null }
type Overview = { usage: Usage; total: number; pending: number; classified: number; classification_enabled: boolean; next_run: string; sources: { id: string; name: string; type: string; enabled: boolean }[] }
type MarkingProgress = { phase: string; total: number; counts: Record<string, number>; items: { news_id: number; title: string; source_id: string; state: string; topic: string | null; severity: string | null }[] }
type Run = { progress: MarkingProgress | null; usage: Usage; id: number; kind: string; status: string; started_at: number; finished_at: number | null; error: string | null; result: { discovered: number; fetched: number; classified: number; errors: number } | null }
const date = (value: string | number) => new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const number = (value: number) => value.toLocaleString('ru-RU')
function Source({ item }: { item: News }) {
  const telegram = item.source_type === 'telegram'
  return <span className={`source-identity ${telegram ? 'telegram' : ''}`}>
    <span className="source-kind"><SourceLogo id={item.source_id} type={item.source_type} url={item.url} size={16} />{telegram ? 'Telegram' : item.source_type === 'rss' ? 'RSS' : 'Сайт'}</span>
    <span>{item.source_name || item.source_id}</span>{telegram && item.source_channel && item.source_name !== `@${item.source_channel}` && <span className="channel-name">@{item.source_channel}</span>}
  </span>
}
const usd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 })
function CostEstimate({ usage }: { usage: Usage }) {
  return <span>{usage.estimated_usd != null && usage.estimated_peak_usd != null ? `${usd(usage.estimated_usd)}–${usd(usage.estimated_peak_usd)}` : 'Нет оценки'}</span>
}
function UsageSummary({ usage }: { usage: Usage }) {
  return <section className="usage-summary" aria-label="Расход токенов AI"><h2>Расход токенов AI</h2><dl><div><dt>Всего учтено</dt><dd>{number(usage.total_tokens)}</dd></div><div><dt>Вход</dt><dd>{number(usage.input_tokens)}</dd></div><div><dt>Выход</dt><dd>{number(usage.output_tokens)}</dd></div><div><dt>Запросов</dt><dd>{number(usage.requests)}</dd></div><div><dt>Примерная стоимость · USD</dt><dd className="cost-estimate"><CostEstimate usage={usage} /></dd></div></dl><p className="footnote">Учёт с момента включения счётчика. Предыдущие запуски не включены. Оценка по тарифам DeepSeek V4.1 Flash: вход $0.15 / выход $0.60 за 1 млн токенов; в пиковые часы — вдвое выше. Без скидки за кэш. Тариф шлюза может отличаться.{usage.unpriced_requests > 0 && ` Не включено в стоимость: ${number(usage.unpriced_requests)} запросов (нет тарифа или данных).`}{usage.unknown_requests > 0 && ` Без данных о токенах: ${number(usage.unknown_requests)} запросов.`}</p></section>
}
function Notice({ text }: { text: string }) { return <p className="notice" role="status">{text}</p> }
function RunButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  async function start() {
    setBusy(true); setError('')
    try { await request('/api/runs', 'POST'); navigate('/runs') } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="run-control"><Button className="primary" disabled={busy} onClick={start}><HugeiconsIcon icon={PlayIcon} size={17} aria-hidden="true" />{busy ? 'Запускаем…' : 'Запустить сбор'}</Button>{error && <Notice text={error} />}</div>
}
function Inbox() {
  const [params, setParams] = useSearchParams()
  const source = params.get('source') || ''
  const topic = params.get('topic') || ''
  const severity = params.get('severity') || ''
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    next.delete('offset')
    setParams(next)
  }
  function goToPage(value: number) {
    const next = new URLSearchParams(params)
    next.set('offset', String(value))
    setParams(next)
  }
  const offset = Math.max(0, Number(params.get('offset')) || 0)
  const { data: overview, error: overviewError } = useData<Overview>('/api/overview')
  const { data, error } = useData<{ items: News[]; total: number }>(`/api/news?limit=20&offset=${offset}${source ? `&source=${encodeURIComponent(source)}` : ''}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}${severity ? `&severity=${encodeURIComponent(severity)}` : ''}`)
  return <><div className="page-heading"><div><h1>Ньюсрум</h1><p className="intro">Материалы из открытых источников. Новые публикации — каждый час.</p></div><RunButton /></div>
    {overviewError && <Notice text={overviewError} />}
    {overview && <><div className="metrics"><div><strong>{overview.total}</strong><span>Собрано материалов</span></div><div><strong>{overview.classified}</strong><span>Размечено</span></div><div><strong>{overview.pending}</strong><span>Ожидают разметки</span></div><div><strong className="time">{new Date(overview.next_run).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</strong><span>Следующий сбор · местное время</span></div></div>
    {!overview.classification_enabled && <Notice text="Сбор работает. Для определения темы и оценки репутационного риска нужен API-ключ модели." />}</>}
    <div className="section-heading"><h2>Размеченные публикации <span>{data?.total ?? '…'}</span></h2></div><div className="news-filters"><label>Источник <select value={source} onChange={e => updateFilter('source', e.target.value)}><option value="">Все источники</option>{overview?.sources.filter(s => s.enabled).map(s => <option key={s.id} value={s.id}>{s.name || s.id} · {s.type === 'telegram' ? 'Telegram' : s.type === 'rss' ? 'RSS' : 'Сайт'}</option>)}</select></label><label>Тема <select value={topic} onChange={e => updateFilter('topic', e.target.value)}><option value="">Все темы</option>{['politics','economy','business','law','society','technology','science','health','environment','culture','sports','other'].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label><label>Уровень риска <select value={severity} onChange={e => updateFilter('severity', e.target.value)}><option value="">Любой риск</option>{['none','low','moderate','high','unclear'].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>{(source || topic || severity) && <button onClick={() => setParams({})}>Сбросить фильтры</button>}</div>
    {error ? <Notice text={error} /> : !data ? <Notice text="Загружаем публикации…" /> : data.items.length === 0 ? <Notice text="По выбранным фильтрам нет размеченных публикаций. Измените фильтры или дождитесь новых материалов." /> : <div className="news-list">{data.items.map((item, i) => <article className="news-row" key={item.id}><span className="row-number">{String(offset+i+1).padStart(2, '0')}</span><div><div className="story-meta"><Source item={item} /><span>{item.published_at ? date(item.published_at) : 'Дата не указана'}</span></div><h3><Link to={`/news/${item.id}`}>{item.title || 'Публикация в Telegram'}</Link></h3><p className="excerpt">{item.excerpt || 'Текст ещё не загружен.'}</p><div className="labels"><span>{labels[item.topic || ''] || 'Тема не определена'}</span><span>{item.severity ? `Риск: ${labels[item.severity] || item.severity}` : 'Оценка не готова'}</span></div></div><Link className="open-story" to={`/news/${item.id}`} aria-label={`Читать ${item.title || 'публикацию'}`}><HugeiconsIcon icon={ArrowUpRight01Icon} size={19} aria-hidden="true" /></Link></article>)}</div>}
    {data && <div className="pagination"><button disabled={offset === 0} onClick={() => goToPage(Math.max(0,offset-20))}><HugeiconsIcon icon={ArrowLeft01Icon} size={16} aria-hidden="true" />Назад</button><span>{data.total ? `${offset+1}–${Math.min(offset+20,data.total)} из ${data.total}` : 'Нет публикаций'}</span><button disabled={offset+20 >= data.total} onClick={() => goToPage(offset+20)}>Далее<HugeiconsIcon icon={ArrowRight01Icon} size={16} aria-hidden="true" /></button></div>}
    <p className="footnote">Пробный сбор: до 5 материалов из каждого источника; загрузка и AI-разметка до 5 текстов. Доступен раз в 5 минут.</p></>
}
function Article() {
  const { id } = useParams()
  const { data, error } = useData<News>(`/api/news/${id}`)
  return <><Link className="back" to="/debug/news"><HugeiconsIcon icon={ArrowLeft01Icon} size={17} aria-hidden="true" />К публикациям</Link>{error ? <Notice text={error} /> : !data ? <Notice text="Загружаем материал…" /> : <article className="article-detail"><div className="story-meta"><Source item={data} /><span>{data.published_at ? date(data.published_at) : 'Дата не указана'}</span></div><h1>{data.title || 'Публикация в Telegram'}</h1><div className="labels"><span>{labels[data.topic || ''] || 'Тема не определена'}</span><span>{data.severity ? `Риск: ${labels[data.severity] || data.severity}` : 'Оценка не готова'}</span><a href={data.url} target="_blank" rel="noreferrer">Первоисточник <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} aria-hidden="true" /></a></div><div className="article-body">{data.text || 'Текст материала ещё не загружен.'}</div><p className="footnote">Оценка отражает репутационный риск для главного героя по содержанию статьи, а не подтверждённость обвинений.</p></article>}</>
}
function LabelingProgress({ run }: { run: Run }) {
  const progress = run.progress
  if (!progress) return null
  const { counts, items, total, phase } = progress
  const done = counts.completed + counts.failed + counts.interrupted
  const stateLabels: Record<string, string> = { queued: 'В очереди', running: 'Размечается', completed: 'Размечено', failed: 'Ошибка разметки', interrupted: 'Прервано' }
  const phaseLabels: Record<string, string> = { discovering: 'Проверяем источники', fetching: 'Загружаем тексты', labeling: 'AI размечает материалы', finished: 'Разметка завершена', disabled: 'AI-разметка отключена', interrupted: 'Запуск прерван', failed: 'Запуск завершился с ошибкой' }
  return <section className="marking-progress" aria-label={`Разметка запуска ${run.id}`}>
    <div className="progress-heading"><h3>{phaseLabels[phase] || phase}</h3>{total > 0 && <span>{done} из {total} обработано</span>}</div>
    {total > 0 ? <><progress max={total} value={done} aria-label={`Обработано ${done} из ${total} материалов`} /><p className="progress-counts" aria-live="polite">Размечено: {counts.completed} · Сейчас: {counts.running} · В очереди: {counts.queued}{counts.failed > 0 && ` · Ошибок: ${counts.failed}`}{counts.interrupted > 0 && ` · Прервано: ${counts.interrupted}`}</p>
    <details open={run.status === 'running'}><summary>Материалы этого запуска ({total})</summary><ul className="marking-items">{[...items].sort((a,b) => (a.state === 'running' ? -1 : 0) - (b.state === 'running' ? -1 : 0)).map(item => <li key={item.news_id}><div><Link to={`/news/${item.news_id}`}>{item.title || 'Публикация в Telegram'}</Link>{item.state === 'completed' && <span className="marking-labels">{labels[item.topic || ''] || item.topic} · Риск: {labels[item.severity || ''] || item.severity}</span>}</div><span className={`marking-state ${item.state}`}>{stateLabels[item.state] || item.state}</span></li>)}</ul></details></> : <p>{phase === 'finished' ? 'Нет текстов, ожидающих разметки.' : phase === 'disabled' ? 'Для разметки нужен API-ключ модели.' : phase === 'discovering' || phase === 'fetching' ? 'После загрузки здесь появятся материалы для AI-разметки.' : 'Разметка материалов не началась.'}</p>}
  </section>
}
function Runs() {
  const [refresh, setRefresh] = useState(0)
  const { data, error } = useData<Run[]>('/api/runs', refresh)
  const { data: overview, error: usageError } = useData<Overview>('/api/overview', refresh)
  useEffect(() => { const timer = setInterval(() => setRefresh(n => n+1), 5000); return () => clearInterval(timer) }, [])
  return <><div className="page-heading"><div><h1>История запусков</h1><p className="intro">Результаты пробного и почасового сбора. Обновление каждые 5 секунд.</p></div><RunButton /></div>{error && <Notice text={error} />}{!data && !error && <Notice text="Загружаем историю…" />}{data?.length === 0 && <Notice text="Запусков пока нет. Запустите пробный сбор, чтобы увидеть результат." />}{usageError && <Notice text={usageError} />}{overview?.usage && <UsageSummary usage={overview.usage} />}<div className="run-list">{data?.map(run => <article className="run-row" key={run.id}><div className="run-top"><h2>Запуск №{run.id} <span>{run.kind === 'demo' ? 'пробный' : 'по расписанию'}</span></h2><span className={`status ${run.status}`}>{{ completed: 'Завершён', running: 'Выполняется', partial: 'Частично', failed: 'Ошибка', interrupted: 'Прерван' }[run.status] || run.status}</span></div><p>{date(run.started_at)}{run.finished_at && ` · ${Math.round(run.finished_at-run.started_at)} с`}</p>{run.result ? <dl>{Object.entries(run.result).map(([key,value]) => <div key={key}><dt>{key === 'discovered' ? 'Новых материалов' : ({ fetched: 'Текстов загружено', classified: 'Размечено', errors: 'Ошибок' }[key] || key)}</dt><dd>{value}</dd></div>)}</dl> : <p>{run.status === 'running' ? 'Запуск выполняется. Прогресс разметки — ниже.' : run.error || 'Запуск был прерван.'}</p>}<LabelingProgress run={run} /><p className="run-usage">{run.usage?.requests ? `AI: ${number(run.usage.total_tokens)} токенов · вход ${number(run.usage.input_tokens)} / выход ${number(run.usage.output_tokens)} · ${run.usage.requests} запросов${run.usage.unknown_requests ? ` · без данных: ${run.usage.unknown_requests}` : ''}` : 'Нет учтённых AI-запросов'}</p>{run.usage?.requests > 0 && <p className="run-usage">Примерная стоимость: <CostEstimate usage={run.usage} />{run.usage.unpriced_requests > 0 && ` · Не учтено запросов: ${run.usage.unpriced_requests}`}</p>}</article>)}</div></>
}
function RouteFocus() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    document.title = pathname === '/demo/mascot' ? 'Маскот · Демо' : pathname === '/' ? 'Альфа-Бизнес · Демо' : 'Ньюсрум · Альфа-Бизнес'
    if (previous.current === pathname) return
    previous.current = pathname
    window.scrollTo(0, 0)
    const main = document.querySelector('main')
    main?.focus({ preventScroll: true })
  }, [pathname])
  return null
}
function NewsLayout() { return <BankMock><div className="newsroom"><Routes><Route path="/news" element={<Recommendations />} /><Route path="/debug/news" element={<Inbox />} /><Route path="/news/:id" element={<Article />} /><Route path="/runs" element={<Runs />} /><Route path="/debug/runs" element={<Runs />} /><Route path="*" element={<><h1>Страница не найдена</h1><Link to="/news">Вернуться в Ньюсрум</Link></>} /></Routes></div></BankMock> }
function App() { return <BrowserRouter><RouteFocus /><Routes><Route path="/demo/mascot" element={<MascotDemo />} /><Route path="/" element={<BankMock />} /><Route path="*" element={<NewsLayout />} /></Routes></BrowserRouter> }
export default App
