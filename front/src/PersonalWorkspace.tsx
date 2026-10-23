import { useEffect, useRef, useState, type ReactNode } from 'react'
import { apiRequest } from './lib/api'
import { useSelectedBusinessId } from './lib/business-selection'
import { selectMember, useSelectedMemberId } from './lib/member-selection'
import { type CompanyContext } from './CompanyContextForm'
import CompanyContextDialogue from './CompanyContextDialogue'
import { Mascot } from './components/Mascot'
import { SourceLogo } from './components/SourceLogo'
import { Button } from './components/ui/button'
import './PersonalWorkspace.css'

type Person = { id: string; name: string; can_approve: boolean }
type Member = Person & { role: string | null; role_label: string | null; version: number; confirmed: boolean; welcome_seen: boolean; answers: { personal_tasks: string; personal_focus: string } }
type Members = { member: Member; members: Person[]; roles: { id: string; label: string }[] }
type Sources = { completed: boolean; source_ids: string[]; sources: { id: string; name: string; type: string; enabled: boolean }[] }
type Proposal = { id: string; member_id: string; author_role: string; base_version: number; changes: Partial<CompanyContext['answers']>; status: string }
type Proposals = { items: Proposal[]; company_version: number; company_answers: Partial<CompanyContext['answers']> }
const labels: Record<string, string> = { description: 'Деятельность', counterparties: 'Покупатели и поставщики', geography: 'География', priorities: 'Общие задачи компании' }

export default function PersonalWorkspace({ children }: { children: ReactNode }) {
  const businessId = useSelectedBusinessId()
  const memberId = useSelectedMemberId()
  return businessId ? <MemberWorkspace key={`${businessId}:${memberId}`} businessId={businessId} memberId={memberId}>{children}</MemberWorkspace> : children
}

function RoleChoice({ roles, current, busy, onSave, onCancel }: { roles: Members['roles']; current: string | null; busy: boolean; onSave: (role: string) => void; onCancel?: () => void }) {
  const [role, setRole] = useState(current || '')
  return <section className="member-role" aria-labelledby="member-role-title">
    <div className="member-role-intro"><Mascot size={76} expression="happy" /><div><h1 id="member-role-title">Ньюсрум в вашей зоне ответственности</h1><p>Сначала выберите основную роль. Маскот учтёт её в вопросах, а рекомендации — в объяснении новостей.</p></div></div>
    <form onSubmit={e => { e.preventDefault(); if (role) onSave(role) }}>
      <fieldset disabled={busy}><legend>Ваша роль в компании</legend>{roles.map(item => <label key={item.id} className={role === item.id ? 'is-selected' : ''}><input type="radio" name="member-role" value={item.id} checked={role === item.id} onChange={() => setRole(item.id)} /><span>{item.label}</span></label>)}</fieldset>
      <p className="member-note">Роль отвечает за персонализацию. Право подтверждать общие сведения назначается отдельно.</p>
      <div className="member-actions"><Button disabled={busy || !role} type="submit">{busy ? 'Сохраняем…' : 'Продолжить с этой ролью'}</Button>{onCancel && <Button variant="secondary" type="button" disabled={busy} onClick={onCancel}>Отмена</Button>}</div>
    </form>
  </section>
}

function MemberWorkspace({ businessId, memberId, children }: { businessId: string; memberId: string; children: ReactNode }) {
  const [data, setData] = useState<Members | null>(null)
  const [context, setContext] = useState<CompanyContext | null>(null)
  const [sources, setSources] = useState<Sources | null>(null)
  const [proposals, setProposals] = useState<Proposals | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [stage, setStage] = useState<'chat' | 'sources' | null>(null)
  const [editingRole, setEditingRole] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const alive = useRef(true)
  const base = `/api/businesses/${encodeURIComponent(businessId)}`
  const headers = { 'X-Demo-User-ID': memberId, 'Content-Type': 'application/json' }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const abort = new AbortController()
    const options = { signal: abort.signal, headers: { 'X-Demo-User-ID': memberId } }
    Promise.all([
      apiRequest<Members>(`${base}/member-context`, options),
      apiRequest<CompanyContext>(`${base}/context`, options),
      apiRequest<Sources>(`${base}/onboarding`, options),
      apiRequest<Proposals>(`${base}/context/proposals`, options),
    ]).then(([member, company, sourceList, proposed]) => {
      if (abort.signal.aborted) return
      setData(member); setContext(company); setSources(sourceList); setChosen(sourceList.source_ids); setProposals(proposed); setError('')
    }).catch(e => { if (!abort.signal.aborted) setError(e.message) })
    return () => abort.abort()
  }, [base, memberId, retry])
  useEffect(() => {
    const edit = (event: Event) => { if ((event as CustomEvent).detail?.businessId === businessId) setStage('chat') }
    const editSources = (event: Event) => { if ((event as CustomEvent).detail?.businessId === businessId) setStage('sources') }
    window.addEventListener('alfa-edit-context', edit); window.addEventListener('alfa-edit-onboarding', editSources)
    return () => { window.removeEventListener('alfa-edit-context', edit); window.removeEventListener('alfa-edit-onboarding', editSources) }
  }, [businessId])
  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { if (alive.current) setBusy(false) }
  }
  function chooseRole(role: string) { void perform(async () => {
    if (!data) return
    const saved = await apiRequest<Member>(`${base}/member-context/role`, { method: 'POST', headers, body: JSON.stringify({ role, version: data.member.version }) })
    if (alive.current) { setData({ ...data, member: saved }); setEditingRole(false); setStage(null) }
  }) }
  function welcome(start: boolean) { void perform(async () => {
    if (!data) return
    const saved = await apiRequest<Member>(`${base}/member-context/welcome`, { method: 'POST', headers })
    if (alive.current) { setData({ ...data, member: saved }); if (start) setStage('chat') }
  }) }
  function confirm(_answers: CompanyContext['answers'], dialogueId?: string, revision?: number) { void perform(async () => {
    if (!data || !dialogueId || revision == null) return
    const saved = await apiRequest<{ member: Member; proposal_id: string | null }>(`${base}/member-context/confirm`, { method: 'POST', headers, body: JSON.stringify({ dialogue_id: dialogueId, revision }) })
    if (!alive.current) return
    setData({ ...data, member: saved.member }); setStage(sources?.completed ? null : 'sources')
    setNotice(saved.proposal_id ? 'Ваш личный контекст сохранён. Уточнения о компании отправлены ответственному на подтверждение.' : 'Ваш личный контекст сохранён. Рекомендации будут учитывать вашу роль, задачи и интересы.')
    setRetry(n => n + 1)
  }) }
  function saveSources() { void perform(async () => {
    await apiRequest(`${base}/onboarding`, { method: 'POST', headers, body: JSON.stringify({ source_ids: chosen }) })
    if (alive.current && sources) { setSources({ ...sources, completed: true, source_ids: chosen }); setStage(null); window.dispatchEvent(new CustomEvent('alfa-onboarding-saved', { detail: { businessId } })) }
  }) }
  function review(id: string, action: string) { void perform(async () => {
    await apiRequest(`${base}/context/proposals/${encodeURIComponent(id)}/review`, { method: 'POST', headers, body: JSON.stringify({ action, version: proposals?.company_version }) })
    if (alive.current) { setRetry(n => n + 1); setNotice(action === 'approve' ? 'Общий контекст обновлён для всех сотрудников.' : 'Предложение отклонено. Общий контекст не изменился.') }
  }) }
  if (!data || !context || !sources || !proposals) return <section className="member-workspace"><h1>Ньюсрум</h1>{error ? <div role="alert"><p>{error}</p><Button onClick={() => setRetry(n => n + 1)}>Повторить загрузку</Button></div> : <p role="status">Загружаем ваш профиль и контекст компании…</p>}</section>
  const own = data.member
  const showRole = !own.role || editingRole
  const showWelcome = !showRole && !own.welcome_seen && !stage
  const canSeeRecommendations = own.confirmed && sources.completed
  const pending = proposals.items.filter(p => p.status === 'pending')
  return <div className="member-workspace">
    <div className="member-toolbar"><label>Демо-пользователь<select value={memberId} onChange={e => selectMember(businessId, e.target.value)}>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}{m.can_approve ? ' · ответственный за контекст' : ''}</option>)}</select></label><div><strong>{own.role_label || 'Роль ещё не выбрана'}</strong>{own.role && <button disabled={busy} onClick={() => { setStage(null); setEditingRole(true) }}>Изменить роль</button>}</div></div>
    {error && <div className="member-error" role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>Загрузить актуальные данные</button></div>}
    {notice && <p className="member-notice" role="status">{notice}</p>}
    {showRole ? <RoleChoice roles={data.roles} current={own.role} busy={busy} onSave={chooseRole} onCancel={own.role ? () => setEditingRole(false) : undefined} /> : <>
      {showWelcome ? <section className="newsroom-welcome" aria-labelledby="member-welcome-title"><div className="newsroom-welcome-mascot"><Mascot size={112} expression="happy" /></div><div className="newsroom-welcome-copy"><h1 id="member-welcome-title">Ньюсрум для ваших решений</h1><p>Находим значимые новости и объясняем их влияние на бизнес с учётом вашей роли: {own.role_label?.toLocaleLowerCase('ru')}.</p><ol className="newsroom-welcome-steps"><li><strong>Уточните то, что важно для вашей роли</strong><span>{context.status === 'confirmed' ? 'Коллеги уже описали компанию. Маскот учтёт эти сведения и спросит о вашей зоне ответственности.' : 'Маскот учтёт известные данные и поможет описать бизнес и ваши задачи.'}</span></li><li><strong>Проверьте результат разговора</strong><span>Личные задачи останутся в вашем профиле. Общие уточнения рассмотрит ответственный.</span></li><li><strong>Получайте персональные рекомендации</strong><span>Новости, объяснения и возможные действия будут связаны с вашими интересами и задачами.</span></li></ol><div className="newsroom-welcome-actions"><Button className="newsroom-welcome-primary" disabled={busy} onClick={() => welcome(true)}>Настроить мои рекомендации</Button><Button variant="ghost" disabled={busy} onClick={() => welcome(false)}>Позже</Button></div></div></section> : <>
        {stage === 'chat' ? <section className="member-dialogue"><div className="member-section-heading"><h1>Уточним контекст для вас</h1><p>{own.role_label} · до 6 вопросов</p></div><details className="member-company-summary" open><summary>Что уже известно о компании</summary><dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{context.answers[key as keyof CompanyContext['answers']] || 'Пока не уточняли'}</dd></div>)}</dl><p>Это общие сведения коллег. Ваши задачи будут сохранены отдельно.</p></details><CompanyContextDialogue key={`${memberId}:${own.version}:${context.version}`} memberId={memberId} context={context} busy={busy} onSave={confirm} onCancel={() => setStage(null)} /></section> : stage === 'sources' ? <section className="member-sources"><h1>Источники новостей</h1><p>Источники общие для компании. Ранжирование и объяснения учитывают личный контекст каждого сотрудника.</p><fieldset disabled={busy}><legend className="bank-sr-only">Источники компании</legend>{sources.sources.map(source => <label key={source.id}><input type="checkbox" checked={chosen.includes(source.id)} onChange={() => setChosen(current => current.includes(source.id) ? current.filter(id => id !== source.id) : [...current, source.id])} /><SourceLogo id={source.id} type={source.type} /><span>{source.name}{!source.enabled && ' · сбор отключён'}</span></label>)}</fieldset><div className="member-actions"><Button disabled={busy || !chosen.length} onClick={saveSources}>Сохранить источники</Button><Button variant="secondary" disabled={busy} onClick={() => setStage(null)}>Позже</Button></div></section> : <>
          {!canSeeRecommendations && <h1 className="newsroom-intro-title">Ньюсрум</h1>}
          <section className="member-context-card"><Mascot size={48} expression="happy" /><div><h2>{own.confirmed ? 'Ваши рекомендации настроены' : 'Настроим Ньюсрум под вашу роль'}</h2><p>{own.confirmed ? 'Учитываем общий контекст компании и ваши личные задачи.' : context.status === 'confirmed' ? 'Контекст компании уже есть. Осталось уточнить вашу ответственность и интересы.' : 'Короткий разговор поможет учесть особенности бизнеса и ваши задачи.'}</p><div className="member-actions"><Button disabled={busy} onClick={() => setStage('chat')}>{own.confirmed ? 'Мой контекст' : 'Продолжить с маскотом'}</Button>{!sources.completed && <Button variant="secondary" disabled={busy} onClick={() => setStage('sources')}>Выбрать источники</Button>}</div></div></section>
          {own.confirmed && <details className="member-private"><summary>Мой личный контекст</summary><p>Только для выбранного пользователя демо.</p><dl><dt>Задачи и ответственность</dt><dd>{own.answers.personal_tasks || 'Пока не уточняли'}</dd><dt>Интересы и предпочтения</dt><dd>{own.answers.personal_focus || 'Пока не уточняли'}</dd></dl></details>}
          {pending.length > 0 && <section className="member-proposals"><h2>{own.can_approve ? 'Уточнения компании на проверке' : 'Ваши уточнения ожидают подтверждения'}</h2><p>Личные задачи сотрудников в эти предложения не входят.</p>{pending.map(proposal => <details key={proposal.id}><summary>{data.members.find(m => m.id === proposal.member_id)?.name} · {proposal.author_role} · {Object.keys(proposal.changes).length} уточнения</summary><dl>{Object.entries(proposal.changes).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd><span>Сейчас: {proposals.company_answers[key as keyof CompanyContext['answers']] || 'Не уточнено'}</span><strong>Предложено: {value || 'Неизвестно'}</strong></dd></div>)}</dl>{own.can_approve && <><p>{proposal.base_version !== proposals.company_version ? 'Компания уже обновлена. Это предложение устарело — отклоните его и запросите новое уточнение.' : 'Подтверждение изменит общий контекст для всех сотрудников.'}</p><div className="member-actions"><Button disabled={busy || proposal.base_version !== proposals.company_version} onClick={() => review(proposal.id, 'approve')}>Подтвердить общие сведения</Button><Button variant="secondary" disabled={busy} onClick={() => review(proposal.id, 'reject')}>Отклонить</Button></div></>}</details>)}</section>}
          {canSeeRecommendations && <div key={`${own.version}:${context.version}:${sources.source_ids.join(',')}`}>{children}</div>}
        </>}
      </>}
    </>}
  </div>
}
