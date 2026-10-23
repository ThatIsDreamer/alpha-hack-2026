import { Mascot } from './components/Mascot'
import { Button } from './components/ui/button'
import './NewsroomWelcome.css'

export default function NewsroomWelcome({ compact = false, confirmed, completed, busy, error, onStart, onDismiss }: {
  compact?: boolean; confirmed: boolean; completed: boolean; busy: boolean; error: string
  onStart: () => void; onDismiss: () => void
}) {
  return <section className={`newsroom-welcome${compact ? ' is-compact' : ''}`} aria-labelledby="newsroom-welcome-title" aria-busy={busy}>
    <div className="newsroom-welcome-mascot"><Mascot size={compact ? 48 : 112} expression="happy" /></div>
    <div className="newsroom-welcome-copy">
      <h2 id="newsroom-welcome-title">{compact ? confirmed ? 'Ньюсрум знает ваш бизнес' : 'Расскажите о бизнесе — получайте рекомендации по делу' : 'Новости меняются. Узнайте, что это значит для вашего бизнеса.'}</h2>
      <p>{compact ? confirmed ? 'Контекст компании сохранён. Обновите его, если изменились планы, рынки или партнёры.' : 'Маскот поможет собрать контекст компании в коротком разговоре. Начать или продолжить можно здесь.' : 'Знакомьтесь, Ньюсрум — новая функция Альфа-Бизнеса. Находим новости, объясняем их значение для вашей компании и предлагаем возможные действия.'}</p>
      {!compact && <>
        <ol className="newsroom-welcome-steps">
          <li><strong>Расскажите о компании</strong><span>Маскот задаст до 6 вопросов с учётом того, что уже известно.</span></li>
          <li><strong>Выберите источники</strong><span>Отметьте издания и каналы, которым доверяете.</span></li>
          <li><strong>Получайте рекомендации</strong><span>С объяснениями и ссылками на новости, на которых они основаны.</span></li>
        </ol>
        <p className="newsroom-welcome-control">Вы проверите контекст перед сохранением и сможете изменить его в любой момент.</p>
      </>}
      <div className="newsroom-welcome-actions">
        <Button className="newsroom-welcome-primary" disabled={busy} onClick={onStart}>{busy ? 'Открываем…' : confirmed ? completed ? 'Обновить контекст' : 'Выбрать источники' : 'Рассказать о компании'}</Button>
        {!compact && <Button variant="ghost" disabled={busy} onClick={onDismiss}>Позже</Button>}
      </div>
      {error && <p className="newsroom-welcome-error" role="alert">{error}</p>}
    </div>
  </section>
}
