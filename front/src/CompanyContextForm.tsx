import { useState } from 'react'
import { Button } from './components/ui/button'

export type CompanyContext = {
  business_id: string; version: number; status: 'draft' | 'confirmed'
  confirmed_at: string | null; updated_at: string
  facts: { industry: string; industry_code: string; city: string; region: string; revenue_rub: number | null; employees_range: string | null; foreign_trade: boolean | null; countries: string[]; products: Record<string, boolean | null> }
  answers: { description: string; counterparties: string; geography: string; priorities: string }
}
const products: Record<string, string> = { rko: 'Расчётный счёт', guarantee: 'Гарантии', loan: 'Кредит', leasing: 'Лизинг', deposit: 'Депозит', payroll: 'Зарплатный проект', factoring: 'Факторинг' }
const questions = [
  { key: 'description', title: 'Чем занимается компания?', hint: 'Основные товары или услуги и особенности бизнеса.', max: 1500 },
  { key: 'counterparties', title: 'Кто ваши покупатели и поставщики?', hint: 'Типы клиентов, отрасли партнёров и важные зависимости.', max: 1000 },
  { key: 'geography', title: 'Где работает бизнес?', hint: 'Регионы продаж и закупок, страны, импорт или экспорт.', max: 1000 },
  { key: 'priorities', title: 'Какие задачи сейчас важнее всего?', hint: 'Например: новое оборудование, расширение или сезонные закупки.', max: 1000 },
] as const

export default function CompanyContextForm({ context, busy, onSave, onCancel, evidence }: {
  context: CompanyContext; busy: boolean
  onSave: (answers: CompanyContext['answers']) => void
  onCancel?: () => void
  evidence?: Record<string, { quote: string }[]>
}) {
  const [answers, setAnswers] = useState(context.answers)
  const tooLong = questions.some(question => answers[question.key].length > question.max)
  const facts = context.facts
  const activeProducts = Object.entries(facts.products).filter(([, value]) => value === true).map(([key]) => products[key] || key)
  return <form className="company-context-form" onSubmit={event => { event.preventDefault(); onSave(answers) }}>
    <p className="onboarding-description">Уточните бизнес, чтобы новости и действия отвечали задачам компании. Если ответа пока нет, оставьте поле пустым.</p>
    <details className="context-facts" open>
      <summary>Что уже известно о компании</summary>
      <p>Из синтетического профиля. Эти данные не подтверждают текущие потребности бизнеса.</p>
      <dl>
        <div><dt>Отрасль и ОКВЭД</dt><dd>{facts.industry || 'Не указана'} · {facts.industry_code || 'Не указан'}</dd></div>
        <div><dt>Место регистрации</dt><dd>{[facts.city, facts.region].filter(Boolean).join(', ') || 'Не указано'}</dd></div>
        <div><dt>Выручка / сотрудники</dt><dd>{facts.revenue_rub === null ? 'Нет данных о выручке' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(facts.revenue_rub)} · {facts.employees_range || 'Численность неизвестна'}</dd></div>
        <div><dt>Банковские продукты</dt><dd>{activeProducts.join(', ') || 'Нет подтверждённых продуктов'}</dd></div>
        <div><dt>Внешняя торговля</dt><dd>{facts.foreign_trade === null ? 'Нет данных' : facts.foreign_trade ? 'Указана в профиле' : 'Не отмечена в профиле'}{facts.countries.length ? ` · ${facts.countries.join(', ')}` : ''}</dd></div>
      </dl>
    </details>
    <fieldset className="context-questions" disabled={busy}>
      <legend className="bank-sr-only">Уточнения пользователя</legend>
      {questions.map(question => <label key={question.key}>
        <span>{question.title}</span>
        <small id={`context-hint-${question.key}`}>{question.hint}</small>
        <textarea value={answers[question.key]} maxLength={question.max} rows={3} aria-invalid={answers[question.key].length > question.max || undefined} aria-describedby={`context-hint-${question.key}`}
          onChange={event => setAnswers(previous => ({ ...previous, [question.key]: event.target.value }))} />
        {answers[question.key].length > question.max && <small role="alert">Сократите ответ до {question.max} символов. Сейчас: {answers[question.key].length}.</small>}
        {!!evidence?.[question.key]?.length && <small>Основано на ваших словах: {evidence[question.key].map(item => `«${item.quote}»`).join('; ')}</small>}
      </label>)}
    </fieldset>
    <div className="onboarding-footer"><div className="onboarding-note"><p>Ответы сохранятся для этой компании и будут использоваться при подборе рекомендаций. Пустые поля останутся неизвестными.</p>{context.confirmed_at && <p>Подтверждено пользователем {new Date(context.confirmed_at).toLocaleString('ru-RU')} · версия {context.version}</p>}</div><div className="onboarding-actions">
      {onCancel && <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Отмена</Button>}
      <Button type="submit" disabled={busy || tooLong}>{busy ? 'Сохраняем…' : context.status === 'confirmed' ? 'Сохранить контекст' : 'Подтвердить и продолжить'}</Button>
    </div></div>
  </form>
}
