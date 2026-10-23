import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Building03Icon, ArrowDown01Icon, Search01Icon, Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { Button } from './components/ui/button'
import { apiRequest } from './lib/api'
import { selectBusiness, useSelectedBusinessId } from './lib/business-selection'
import './BusinessSelector.css'

type Business = { id: string; group_id: string | null; industry: string; industry_code: string; city: string; region: string; revenue_rub: number | null; is_demo: boolean }
type Profile = Business & { onboarding: { completed: boolean }; group: { id: string; company_count: number; revenue_rub: number | null } | null; employees_range: string | null; countries: string[] }
type Page = { items: Business[]; total: number; offset: number; limit: number }
const revenue = (value: number | null) => value == null ? 'Выручка не указана' : new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value) + ' ₽'

export default function BusinessSelector() {
  const selectedId = useSelectedBusinessId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; page?: Page; error?: string }>({ key: '' })
  const [profile, setProfile] = useState<{ id: string | null; data?: Profile; error?: string }>({ id: null })
  const reduced = useReducedMotion()
  const searchRef = useRef<HTMLInputElement>(null)
  const key = `${query.trim()}:${offset}:${retry}`
  const current = result.key === key ? result : undefined
  const selected = profile.id === selectedId ? profile.data : undefined
  useEffect(() => {
    const refresh = () => setRetry(n => n + 1)
    window.addEventListener('alfa-onboarding-saved', refresh)
    return () => window.removeEventListener('alfa-onboarding-saved', refresh)
  }, [])
  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    apiRequest<Profile>(`/api/businesses/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(data => setProfile({ id: selectedId, data }))
      .catch(error => { if (!controller.signal.aborted) setProfile({ id: selectedId, error: error.message }) })
    return () => controller.abort()
  }, [selectedId, retry])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      apiRequest<Page>(`/api/businesses?q=${encodeURIComponent(query.trim())}&limit=20&offset=${offset}`, { signal: controller.signal })
        .then(page => setResult({ key, page }))
        .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }) })
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [open, query, offset, key])

  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><Button variant="ghost" className="business-trigger" aria-label={selectedId ? `Выбрать компанию. Выбрана ${selectedId}` : 'Выбрать компанию'}>
      <span className="business-mark"><HugeiconsIcon icon={Building03Icon} size={19} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="business-trigger-copy"><strong>{selectedId || 'Мои компании'}</strong><small>{selected?.city || (selectedId ? 'Компания выбрана' : 'Выбрать компанию')}</small></span>
      <HugeiconsIcon icon={ArrowDown01Icon} size={14} aria-hidden="true" />
    </Button></Popover.Trigger>
    <AnimatePresence>
      {open && <Popover.Portal forceMount><Popover.Content forceMount asChild align="end" sideOffset={10} collisionPadding={12} onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus() }}>
        <motion.div key="business-picker" className="business-picker" aria-label="Выбор компании"
          initial={{ opacity: 0, y: reduced ? 0 : -5, scale: reduced ? 1 : 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : -3, scale: reduced ? 1 : 0.99 }}
          transition={{ duration: reduced ? 0.1 : 0.16, ease: [0.16, 1, 0.3, 1] }}>
          <div className="business-picker-heading"><div><h2>Мои компании</h2><p>Выберите профиль для работы</p></div><Popover.Close asChild><Button variant="ghost" size="icon" aria-label="Закрыть выбор компании"><HugeiconsIcon icon={Cancel01Icon} size={18} /></Button></Popover.Close></div>
          {selectedId && <div className="business-current"><span>Выбрана компания</span><strong>{selectedId}</strong>{selected && <p>{selected.industry}{selected.group && ` · Компаний в группе: ${selected.group.company_count}`}</p>}{profile.id === selectedId && profile.error && <p role="status">Профиль недоступен. <button onClick={() => setRetry(n => n + 1)}>Повторить</button></p>}<div className="business-current-actions"><button onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('alfa-edit-onboarding', { detail: { businessId: selectedId } })) }}>{selected?.onboarding?.completed ? 'Источники новостей' : 'Настроить источники'}</button><button onClick={() => selectBusiness(null)}>Снять выбор</button></div></div>}
          <label className="business-search"><HugeiconsIcon icon={Search01Icon} size={18} aria-hidden="true" /><input ref={searchRef} value={query} onChange={e => { setQuery(e.target.value); setOffset(0) }} placeholder="ID, отрасль, город или группа" aria-label="Поиск компании" /></label>
          <div className="business-results" aria-busy={!current}>
            {!current && <p className="business-message" role="status">Загружаем компании…</p>}
            {current?.error && <div className="business-message" role="alert"><p>{current.error}</p><Button variant="secondary" onClick={() => setRetry(n => n + 1)}>Повторить</Button></div>}
            {current?.page?.total === 0 && <p className="business-message" role="status">Компании не найдены. Попробуйте другой ID, город или отрасль.</p>}
            {current?.page && <ul aria-label="Компании">{current.page.items.map(company => <li key={company.id}><button className="business-option" aria-pressed={company.id === selectedId} onClick={() => { selectBusiness(company.id); setOpen(false) }}>
              <span className="business-option-copy"><span className="business-option-title">{company.id}{company.is_demo && <small>Демо</small>}</span><span className="business-industry">{company.industry || 'Отрасль не указана'}</span><span className="business-option-meta">{company.city || company.region || 'Регион не указан'} · {revenue(company.revenue_rub)}</span></span>
              {company.id === selectedId && <HugeiconsIcon icon={Tick02Icon} size={18} aria-hidden="true" />}
            </button></li>)}</ul>}
          </div>
          {current?.page && current.page.total > 0 && <div className="business-pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Назад</button><span>{offset + 1}–{Math.min(offset + 20, current.page.total)} из {current.page.total.toLocaleString('ru-RU')}</span><button disabled={offset + 20 >= current.page.total} onClick={() => setOffset(offset + 20)}>Далее</button></div>}
          <p className="business-picker-note">Синтетические профили · выбор сохранится в этом браузере</p>
        </motion.div>
      </Popover.Content></Popover.Portal>}
    </AnimatePresence>
  </Popover.Root>
}
