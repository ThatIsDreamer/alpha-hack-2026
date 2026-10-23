import { useEffect, useRef, useState } from 'react'
import CompanyContextForm, { type CompanyContext } from './CompanyContextForm'
import { Mascot } from './components/Mascot'
import { Button } from './components/ui/button'
import { apiRequest } from './lib/api'
import './CompanyContextDialogue.css'

type Message = { id: number; role: 'assistant' | 'user'; field: keyof CompanyContext['answers']; text: string; skipped?: boolean }
type Session = {
  id: string; revision: number; base_version: number; ai_available: boolean
  draft: CompanyContext['answers']; evidence: Record<string, { message_id: number; quote: string }[]>
  messages: Message[]; pending: (keyof CompanyContext['answers'])[]; ready: boolean; turns: number
}
const labels = { description: 'Деятельность', counterparties: 'Покупатели и поставщики', geography: 'География', priorities: 'Текущие задачи' }

export default function CompanyContextDialogue({ context, busy, onSave, onCancel }: {
  context: CompanyContext; busy: boolean
  onSave: (answers: CompanyContext['answers'], dialogueId?: string) => void
  onCancel?: () => void
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [manual, setManual] = useState(false)
  const [retry, setRetry] = useState(0)
  const mounted = useRef(true)
  const request = useRef<AbortController | null>(null)
  const questionHeading = useRef<HTMLHeadingElement>(null)
  const base = `/api/businesses/${encodeURIComponent(context.business_id)}/context/dialogue`
  useEffect(() => {
    mounted.current = true
    const abort = new AbortController()
    apiRequest<{ session: Session | null; ai_available: boolean }>(base, { signal: abort.signal })
      .then(data => { if (!abort.signal.aborted) { setSession(data.session); setAiAvailable(data.ai_available); setLoading(false); setError('') } })
      .catch(e => { if (!abort.signal.aborted) { setLoading(false); setError(e.message) } })
    return () => { mounted.current = false; abort.abort(); request.current?.abort() }
  }, [base, retry])
  useEffect(() => { questionHeading.current?.focus({ preventScroll: true }) }, [session?.revision, session?.id])
  async function advance(skip = false) {
    if (processing || busy) return
    setProcessing(true); setError('')
    const abort = new AbortController()
    request.current = abort
    try {
      const next = await apiRequest<Session>(session ? `${base}/answer` : `${base}/start`, {
        method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' },
        ...(session ? { body: JSON.stringify({ dialogue_id: session.id, revision: session.revision, answer, skip }) } : {}),
      })
      if (mounted.current) { setSession(next); setAnswer(''); setAiAvailable(next.ai_available) }
    } catch (e) { if (mounted.current && !abort.signal.aborted) setError((e as Error).message) }
    finally { if (mounted.current) setProcessing(false) }
  }
  const draft = { ...(session?.draft || context.answers) }
  // Keep an unsent answer when switching to the fallback form.
  if (manual && session && !session.ready && answer.trim()) {
    const key = session.pending[0]
    draft[key] = [draft[key], answer.trim()].filter(Boolean).join('\n')
  }
  if (manual || session?.ready) return <div className="context-dialogue-review">
    <div className="context-dialogue-guide"><Mascot size={72} expression="happy" /><p>{manual ? 'Можно уточнить контекст в форме. Ответы из диалога уже перенесены.' : 'Вот как я понял ваш бизнес. Проверьте формулировки и исправьте неточности. Пока вы не подтвердите профиль, рекомендации используют прежний контекст.'}</p></div>
    <CompanyContextForm context={{ ...context, answers: draft }} busy={busy}
      evidence={manual ? undefined : session?.evidence}
      onSave={value => onSave(value, manual ? undefined : session?.id)} onCancel={onCancel} />
  </div>
  const current = session?.messages[session.messages.length - 1]
  return <section className="context-dialogue" aria-label="Диалог о компании" aria-busy={loading || processing}>
    <div className="context-dialogue-guide"><Mascot size={104} expression={processing ? 'attentive' : 'curious-right'} /><div>
      <h2 ref={questionHeading} tabIndex={-1}>{current?.text || 'Давайте познакомимся с вашим бизнесом'}</h2>
      <p>{session ? `${labels[session.pending[0]]} · ответов ${session.turns} из максимум 6` : 'Обсудим деятельность, партнёров, географию и задачи. До четырёх основных вопросов и двух уточнений.'}</p>
    </div></div>
    {loading && <p role="status">Загружаем сохранённый диалог…</p>}
    {!loading && !aiAvailable && <p className="context-dialogue-notice" role="status">Модель пока не подключена. Можно заполнить профиль через форму — все возможности сохранения доступны.</p>}
    {error && <div className="onboarding-error" role="alert"><p>{error}</p><Button type="button" disabled={processing} variant="secondary" onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Загрузить сохранённый диалог</Button></div>}
    {session && session.messages.length > 1 && <details className="context-dialogue-history"><summary>История разговора · {session.turns} ответов</summary><ol>{session.messages.slice(0, -1).map(message => <li key={message.id} className={`context-message-${message.role}`}><strong>{message.role === 'user' ? 'Вы' : 'Маскот'}</strong><p>{message.text}</p></li>)}</ol></details>}
    {!loading && <form onSubmit={event => { event.preventDefault(); void advance() }}>
      {session && <label className="context-dialogue-answer"><span>Ваш ответ</span><textarea value={answer} onChange={event => setAnswer(event.target.value)} rows={4} maxLength={1500} disabled={processing || busy} aria-describedby="context-dialogue-help" /></label>}
      <p id="context-dialogue-help" className="context-dialogue-help">{processing ? 'Разбираю ответ…' : 'Ответ будет обработан подключённой моделью. Не указывайте персональные данные и секреты. Профиль сохранится после вашего подтверждения.'}</p>
      <div className="context-dialogue-actions">
        <Button type="button" variant="secondary" disabled={processing || busy} onClick={() => setManual(true)}>Заполнить форму</Button>
        {onCancel && <Button type="button" variant="secondary" disabled={processing || busy} onClick={onCancel}>Отмена</Button>}
        {session && <Button type="button" variant="secondary" disabled={processing || busy} onClick={() => void advance(true)}>Пропустить вопрос</Button>}
        <Button type="submit" disabled={processing || busy || (!!session && (!answer.trim() || !aiAvailable))}>{processing ? 'Обрабатываем…' : session ? 'Ответить' : 'Начать диалог'}</Button>
      </div>
    </form>}
  </section>
}
