import { useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useParams, useSearchParams, useNavigate } from 'react-router'
import './App.css'

const labels: Record<string,string> = { politics: 'Политика', economy: 'Экономика', business: 'Бизнес', law: 'Право', society: 'Общество', technology: 'Технологии', science: 'Наука', health: 'Здоровье', environment: 'Экология', culture: 'Культура', sports: 'Спорт', other: 'Другое', none: 'Нет', low: 'Низкий', moderate: 'Умеренный', high: 'Высокий', unclear: 'Неясно' }
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
async function request<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(`${API}${path}`, { method })
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail || 'API недоступен. Попробуйте ещё раз.')
  return data
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

type News = { id: number; title: string; source_id: string; url: string; excerpt: string; text: string; status: string; topic: string | null; severity: string | null; published_at: string | null }
type Overview = { total: number; pending: number; classified: number; classification_enabled: boolean; next_run: string; sources: { id: string; type: string; enabled: boolean }[] }
type Run = { id: number; kind: string; status: string; started_at: number; finished_at: number | null; error: string | null; result: { discovered: number; fetched: number; classified: number; errors: number } | null }
const date = (value: string | number) => new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
function Notice({ text }: { text: string }) { return <p className="notice" role="status">{text}</p> }
function RunButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  async function start() {
    setBusy(true); setError('')
    try { await request('/api/runs', 'POST'); navigate('/runs') } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="run-control"><button className="primary" disabled={busy} onClick={start}>{busy ? 'Запускаем…' : 'Запустить сбор'} <span aria-hidden="true">↗</span></button>{error && <Notice text={error} />}</div>
}
function Inbox() {
  const [params, setParams] = useSearchParams()
  const source = params.get('source') || ''
  const offset = Math.max(0, Number(params.get('offset')) || 0)
  const { data: overview, error: overviewError } = useData<Overview>('/api/overview')
  const { data, error } = useData<{ items: News[]; total: number }>(`/api/news?limit=20&offset=${offset}${source ? `&source=${encodeURIComponent(source)}` : ''}`)
  return <><div className="page-heading"><div><p className="eyebrow">ЛЕНТА НОВОСТЕЙ</p><h1>Новости в одном месте.</h1><p className="intro">Материалы из открытых источников. Новые публикации — каждый час.</p></div><RunButton /></div>
    {overviewError && <Notice text={overviewError} />}
    {overview && <><div className="metrics"><div><strong>{overview.total}</strong><span>Собрано материалов</span></div><div><strong>{overview.classified}</strong><span>Размечено</span></div><div><strong>{overview.pending}</strong><span>Ожидают разметки</span></div><div><strong className="time">{new Date(overview.next_run).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</strong><span>Следующий сбор · местное время</span></div></div>
    {!overview.classification_enabled && <Notice text="Сбор работает. Для определения темы и оценки репутационного риска нужен API-ключ модели." />}</>}
    <div className="section-heading"><h2>Последние публикации <span>{data?.total ?? '…'}</span></h2><label>Источник <select value={source} onChange={e => setParams(e.target.value ? { source: e.target.value } : {})}><option value="">Все источники</option>{overview?.sources.filter(s => s.enabled).map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label></div>
    {error ? <Notice text={error} /> : !data ? <Notice text="Загружаем публикации…" /> : data.items.length === 0 ? <Notice text="Публикаций пока нет. Запустите сбор или выберите другой источник." /> : <div className="news-list">{data.items.map((item, i) => <article className="news-row" key={item.id}><span className="row-number">{String(offset+i+1).padStart(2, '0')}</span><div><div className="story-meta"><span>{item.source_id}</span><span>{item.published_at ? date(item.published_at) : 'Дата не указана'}</span></div><h3><Link to={`/news/${item.id}`}>{item.title || 'Публикация в Telegram'}</Link></h3><p className="excerpt">{item.excerpt || 'Текст ещё не загружен.'}</p><div className="labels"><span>{labels[item.topic || ''] || 'Тема не определена'}</span><span>{item.severity ? `Риск: ${labels[item.severity] || item.severity}` : 'Оценка не готова'}</span></div></div><Link className="open-story" to={`/news/${item.id}`} aria-label={`Читать ${item.title || 'публикацию'}`}>↗</Link></article>)}</div>}
    {data && <div className="pagination"><button disabled={offset === 0} onClick={() => setParams({ source, offset: String(Math.max(0,offset-20)) })}>← Назад</button><span>{data.total ? `${offset+1}–${Math.min(offset+20,data.total)} из ${data.total}` : 'Нет публикаций'}</span><button disabled={offset+20 >= data.total} onClick={() => setParams({ source, offset: String(offset+20) })}>Далее →</button></div>}
    <p className="footnote">Пробный сбор: до 5 материалов из каждого источника и загрузка до 5 текстов. Доступен раз в 5 минут.</p></>
}
function Article() {
  const { id } = useParams()
  const { data, error } = useData<News>(`/api/news/${id}`)
  return <><Link className="back" to="/">← К публикациям</Link>{error ? <Notice text={error} /> : !data ? <Notice text="Загружаем материал…" /> : <article className="article-detail"><p className="eyebrow">{data.source_id} · {data.published_at ? date(data.published_at) : 'Дата не указана'}</p><h1>{data.title || 'Публикация в Telegram'}</h1><div className="labels"><span>{labels[data.topic || ''] || 'Тема не определена'}</span><span>{data.severity ? `Риск: ${labels[data.severity] || data.severity}` : 'Оценка не готова'}</span><a href={data.url} target="_blank" rel="noreferrer">Первоисточник ↗</a></div><div className="article-body">{data.text || 'Текст материала ещё не загружен.'}</div><p className="footnote">Оценка отражает репутационный риск для главного героя по содержанию статьи, а не подтверждённость обвинений.</p></article>}</>
}
function Runs() {
  const [refresh, setRefresh] = useState(0)
  const { data, error } = useData<Run[]>('/api/runs', refresh)
  useEffect(() => { const timer = setInterval(() => setRefresh(n => n+1), 5000); return () => clearInterval(timer) }, [])
  return <><div className="page-heading"><div><p className="eyebrow">ЖУРНАЛ СБОРА</p><h1>История запусков.</h1><p className="intro">Результаты пробного и почасового сбора. Обновление каждые 5 секунд.</p></div><RunButton /></div>{error && <Notice text={error} />}{!data && !error && <Notice text="Загружаем историю…" />}{data?.length === 0 && <Notice text="Запусков пока нет. Запустите пробный сбор, чтобы увидеть результат." />}<div className="run-list">{data?.map(run => <article className="run-row" key={run.id}><div className="run-top"><h2>Запуск №{run.id} <span>{run.kind === 'demo' ? 'пробный' : 'по расписанию'}</span></h2><span className={`status ${run.status}`}>{{ completed: 'Завершён', running: 'Выполняется', partial: 'Частично', failed: 'Ошибка', interrupted: 'Прерван' }[run.status] || run.status}</span></div><p>{date(run.started_at)}{run.finished_at && ` · ${Math.round(run.finished_at-run.started_at)} с`}</p>{run.result ? <dl>{Object.entries(run.result).map(([key,value]) => <div key={key}><dt>{key === 'discovered' ? 'Новых материалов' : ({ fetched: 'Текстов загружено', classified: 'Размечено', errors: 'Ошибок' }[key] || key)}</dt><dd>{value}</dd></div>)}</dl> : <p>{run.status === 'running' ? 'Проверяем источники и сохраняем тексты…' : run.error || 'Запуск был прерван.'}</p>}</article>)}</div></>
}
function App() { return <BrowserRouter><div className="app"><header><Link className="brand" to="/"><span className="brand-mark">n.</span>Обзор<span className="demo-tag">ДЕМО</span></Link><nav aria-label="Главная навигация"><NavLink to="/" end>Публикации</NavLink><NavLink to="/runs">Запуски</NavLink><a href={`${API}/docs`} target="_blank" rel="noreferrer">API ↗</a></nav></header><main><Routes><Route path="/" element={<Inbox />} /><Route path="/news/:id" element={<Article />} /><Route path="/runs" element={<Runs />} /><Route path="*" element={<><h1>Страница не найдена.</h1><Link to="/">Вернуться к публикациям</Link></>} /></Routes></main><footer><span>Обзор / демо сбора новостей</span><span>Открытые источники · сбор каждый час</span></footer></div></BrowserRouter> }
export default App
