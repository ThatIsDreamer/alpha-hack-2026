import { useEffect, useRef, useState } from 'react'
import { type CompanyContext } from './CompanyContextForm'
import { Mascot } from './components/Mascot'
import { Button } from './components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { apiRequest } from './lib/api'
import './CompanyContextDialogue.css'

type Field = keyof CompanyContext['answers'] | 'personal_tasks' | 'personal_focus'
type Message = { id: number; role: 'assistant' | 'user'; field: Field; text: string; skipped?: boolean }
type Session = {
  id: string; revision: number; base_version: number; ai_available: boolean
  draft: CompanyContext['answers'] & Partial<Record<'personal_tasks' | 'personal_focus', string>>; member_id?: string; evidence: Record<string, { message_id: number; quote: string }[]>
  messages: Message[]; pending: Field[]; ready: boolean; turns: number; corrections?: number
}
const labels: Record<Field, string> = { description: 'Чем занимается компания', counterparties: 'Покупатели и поставщики', geography: 'Где работает бизнес', priorities: 'Общие задачи компании', personal_tasks: 'Ваши задачи и ответственность', personal_focus: 'Ваши интересы и предпочтения' }

export default function CompanyContextDialogue({ context, busy, onSave, onCancel, memberId }: {
  context: CompanyContext; busy: boolean; memberId?: string
  onSave: (answers: CompanyContext['answers'], dialogueId?: string, revision?: number) => void
  onCancel?: () => void
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(false)
  const [answer, setAnswer] = useState('')
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const request = useRef<AbortController | null>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const base = `/api/businesses/${encodeURIComponent(context.business_id)}/context/dialogue`
  useEffect(() => {
    mounted.current = true
    const abort = new AbortController()
    apiRequest<{ session: Session | null }>(base, { signal: abort.signal, headers: memberId ? { 'X-Demo-User-ID': memberId } : {} })
      .then(async data => data.session || apiRequest<Session>(`${base}/start`, { method: 'POST', signal: abort.signal, headers: memberId ? { 'X-Demo-User-ID': memberId } : {} }))
      .then(data => { if (!abort.signal.aborted) { setSession(data); setAiAvailable(data.ai_available); setLoading(false); setError('') } })
      .catch(e => { if (!abort.signal.aborted) { setLoading(false); setError(e.message) } })
    return () => { mounted.current = false; abort.abort(); request.current?.abort() }
  }, [base, retry, memberId])
  useEffect(() => {
    const element = transcript.current
    if (element) {
      if (session?.ready && summary.current && !processing) {
        element.scrollTop += summary.current.getBoundingClientRect().top - element.getBoundingClientRect().top - 20
      } else element.scrollTop = element.scrollHeight
    }
  }, [session?.revision, session?.id, session?.ready, processing, busy, loading, error])
  useEffect(() => {
    const element = input.current
    if (element) { element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 120)}px` }
  }, [answer])
  async function send(skip = false, revise?: Field) {
    if (inFlight.current || busy || !session || (!skip && !revise && !answer.trim())) return
    inFlight.current = true
    setProcessing(true); setError(''); setPendingText(revise ? null : skip ? 'Пока пропустим этот вопрос.' : answer.trim())
    const abort = new AbortController()
    request.current = abort
    try {
      const next = await apiRequest<Session>(`${base}/${revise ? 'revise' : 'answer'}`, {
        method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json', ...(memberId ? { 'X-Demo-User-ID': memberId } : {}) },
        body: JSON.stringify({ dialogue_id: session.id, revision: session.revision,
          ...(revise ? { field: revise } : { answer, skip }) }),
      })
      if (mounted.current) {
        setSession(next); setAnswer(''); setAiAvailable(next.ai_available)
        requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
      }
    } catch (e) { if (mounted.current && !abort.signal.aborted) setError((e as Error).message) }
    finally { inFlight.current = false; if (mounted.current) { setProcessing(false); setPendingText(null) } }
  }
  const blocked = loading || processing || busy
  return <section className={`context-chat${session?.ready ? ' context-chat-ready' : ''}`} aria-label="Чат с маскотом">
    <div className="context-chat-top"><Mascot size={42} expression={processing ? 'attentive' : 'happy'} /><div><strong>Маскот Ньюсрума</strong><span>{processing ? 'Думаю над вашим ответом…' : busy ? 'Сохраняю контекст…' : 'Разберёмся в вашем бизнесе вместе'}</span></div>{onCancel && <button type="button" className="context-chat-close" disabled={blocked} onClick={onCancel}>Закрыть</button>}</div>
    <div ref={transcript} className="context-chat-transcript" role="log" aria-live="polite" aria-relevant="additions" aria-label="Сообщения" tabIndex={0}>
      <div className="context-chat-row context-chat-assistant"><Mascot size={32} expression="happy" /><div className="context-chat-bubble"><p>{memberId ? 'Учту вашу роль и то, что уже известно о компании. Уточним вашу зону ответственности и задачи. Личные ответы останутся в вашем профиле, а изменения общих сведений будут предложены ответственному.' : 'Расскажите немного о компании. Я буду задавать вопросы по одному, а в конце покажу, какой контекст получился. Вы сможете всё уточнить перед сохранением.'}</p></div></div>
      {loading && <div className="context-chat-row context-chat-assistant"><div className="context-chat-bubble" role="status"><p>Секунду, открываю наш разговор…</p></div></div>}
      {session?.messages.map(message => <div key={message.id} className={`context-chat-row context-chat-${message.role === 'assistant' ? 'assistant' : 'user'}`}>
        {message.role === 'assistant' && <Mascot size={32} expression={message.id === session.messages[session.messages.length - 1].id ? 'curious-right' : 'happy'} />}
        <div className="context-chat-bubble"><span className="bank-sr-only">{message.role === 'user' ? 'Вы: ' : 'Маскот: '}</span><p>{message.skipped ? 'Пока пропустим этот вопрос.' : message.text}</p></div>
      </div>)}
      {pendingText && <div className="context-chat-row context-chat-user"><div className="context-chat-bubble"><p>{pendingText}</p></div></div>}
      {processing && <div className="context-chat-row context-chat-assistant"><Mascot size={32} expression="attentive" /><div className="context-chat-bubble context-chat-thinking" role="status">Думаю…</div></div>}
      {!loading && !aiAvailable && <div className="context-chat-row context-chat-assistant"><Mascot size={32} expression="attentive" /><div className="context-chat-bubble"><p>Сейчас модель недоступна. Можно вернуться к разговору позже или пропустить вопросы, на которые пока нет ответа.</p></div></div>}
      {error && <div className="context-chat-row context-chat-assistant"><Mascot size={32} expression="attentive" /><div className="context-chat-bubble context-chat-error" role="alert"><p>{error}</p><button type="button" disabled={blocked} onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Восстановить разговор</button></div></div>}
      {session?.ready && !processing && <div ref={summary} className="context-chat-row context-chat-assistant"><Mascot size={32} expression="happy" /><div className="context-chat-bubble context-chat-summary">
        <p>{memberId ? 'Проверьте результат. Общие сведения — предложения для ответственного. Ваши задачи и интересы — только ваш личный контекст.' : 'Вот как я понял ваш бизнес. Всё верно? Если что-то нужно изменить, выберите «Уточнить» — продолжим разговор.'}</p>
        <dl>{(Object.keys(labels) as Field[]).filter(field => field in session.draft).map(field => <div key={field}><dt>{labels[field]}</dt><dd>{session.draft[field] || 'Пока неизвестно'}</dd><button type="button" disabled={blocked || (session.corrections || 0) >= 4} onClick={() => void send(false, field)} aria-label={`Уточнить: ${labels[field]}`}>Уточнить</button></div>)}</dl>
        {!!Object.values(session.evidence).flat().length && <details><summary>На основе ваших ответов</summary>{Object.entries(session.evidence).map(([field, items]) => <p key={field}>{items.map(item => `«${item.quote}»`).join('; ')}</p>)}</details>}
        <Button className="context-chat-confirm" type="button" disabled={blocked} onClick={() => onSave(session.draft, session.id, session.revision)}>{busy ? 'Сохраняю…' : memberId ? 'Сохранить мой контекст и отправить уточнения' : 'Всё верно, сохранить'}</Button>
        <small>{memberId ? 'Общий контекст изменится только после подтверждения ответственного. Ваш личный контекст будет применён сразу.' : 'До подтверждения рекомендации используют прежний контекст компании.'}</small>
      </div></div>}
    </div>
    {session && !session.ready && <div className="context-chat-bottom">
      <form className="context-chat-composer" onSubmit={event => { event.preventDefault(); void send() }}>
        <textarea ref={input} value={answer} onChange={event => setAnswer(event.target.value)} rows={1} maxLength={1500} disabled={blocked} aria-label="Сообщение маскоту" placeholder="Напишите маскоту…" onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (aiAvailable) void send() }
        }} />
        <button type="submit" className="context-chat-send" disabled={blocked || !answer.trim() || !aiAvailable} aria-label="Отправить сообщение"><HugeiconsIcon icon={ArrowUpRight01Icon} size={21} aria-hidden="true" /></button>
      </form>
      <div className="context-chat-foot"><span>Enter — отправить · Shift + Enter — новая строка</span><button type="button" disabled={blocked} onClick={() => void send(true)}>Пропустить вопрос</button></div>
      <p className="context-chat-privacy">Ответы обрабатывает подключённая модель. Не отправляйте персональные данные и секреты.</p>
    </div>}
  </section>
}
