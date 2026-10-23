import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, ArrowRight01Icon, Cancel01Icon, Contact01Icon, CreditCardIcon, DashboardSquareAddIcon, DocumentValidationIcon, File01Icon, FileAttachmentIcon, FileDownloadIcon, FileImportIcon, Invoice01Icon, Logout03Icon, Mail01Icon, Menu01Icon, Message01Icon, Notification03Icon, ReceiptDollarIcon, Settings01Icon, Task01Icon, TimeQuarterPassIcon, TransactionHistoryIcon, UserGroupIcon, Wallet01Icon } from '@hugeicons/core-free-icons'
import { Button } from './components/ui/button'
import { Skeleton } from './components/ui/skeleton'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import './BankMock.css'
import alfaLogo from './assets/alfa-logo.png'
import BusinessSelector from './BusinessSelector'
import BusinessWorkspace from './BusinessOnboarding'
import PersonalWorkspace from './PersonalWorkspace'

const navigation = [
  { text: 'Заявки', icon: Task01Icon },
  { text: 'Новый платёж', icon: Add01Icon },
  { text: 'Лента операций', icon: TransactionHistoryIcon },
  { text: 'Платежи в работе', icon: TimeQuarterPassIcon },
  { text: 'Импорт реестров', icon: FileImportIcon },
  { text: 'Выписка', icon: FileDownloadIcon },
  { text: 'Счета', icon: Wallet01Icon },
  { text: 'Контрагенты', icon: UserGroupIcon },
  { text: 'Справки', icon: FileAttachmentIcon },
  { text: 'Счета на оплату', icon: Invoice01Icon },
  { text: 'Карты', icon: CreditCardIcon },
]
function Icon({ icon, size = 18 }: { icon: typeof Add01Icon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} style={{ width: size, height: size }} strokeWidth={1.6} aria-hidden="true" />
}
function MockWorkspace() {
  return <div className="bank-workspace" aria-label="Демонстрационный макет содержимого">
    <div className="bank-summary-skeleton" aria-hidden="true">
      <div className="bank-balance-placeholder">
        <Skeleton className="sk-line sk-label" /><Skeleton className="sk-balance" />
        <Skeleton className="sk-line sk-subtitle" /><div className="sk-currencies"><Skeleton /><Skeleton /><Skeleton /></div>
        <div className="sk-offer"><Skeleton className="sk-circle" /><Skeleton className="sk-line" /></div>
        <div className="sk-account-row">{[0,1].map(i => <div key={i}><Skeleton className="sk-square" /><div><Skeleton className="sk-line" /><Skeleton className="sk-line short" /></div></div>)}</div>
      </div>
      <div className="bank-tasks-placeholder"><Skeleton className="sk-line sk-label" />{Array.from({ length: 7 }, (_,i) => <div className="sk-task" key={i}><Skeleton className={`sk-line task-${i % 3}`} /><Skeleton className="sk-dot" /></div>)}</div>
      <div className="bank-card-placeholder"><Skeleton className="sk-line sk-label" /><Skeleton className="sk-line sk-subtitle" /><Skeleton className="sk-card-art" /><Skeleton className="sk-line short" /></div>
      <div className="sk-summary-footer"><Skeleton /><Skeleton /></div>
    </div>
    <div className="bank-tabs-placeholder" aria-hidden="true"><div><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div><div><Skeleton className="sk-square" /><Skeleton className="sk-square" /></div></div>
    <div className="bank-lower-placeholder" aria-hidden="true">
      <div className="sk-applications"><Skeleton className="sk-line sk-label" />{[0,1,2].map(i => <div className="sk-application" key={i}><Skeleton className="sk-line short" /><Skeleton className="sk-line" /><div><Skeleton className="sk-line" /><Skeleton className="sk-line" /></div></div>)}</div>
      <div className="sk-conversion"><Skeleton className="sk-line sk-label" />{[0,1,2].map(i => <div className="sk-conversion-row" key={i}><Skeleton className="sk-circle" /><Skeleton className="sk-line" /><Skeleton className="sk-line" /></div>)}</div>
      <div className="sk-promos"><Skeleton /><Skeleton /></div>
    </div>
    <p className="bank-mock-caption">Демонстрационный макет</p>
  </div>
}
export default function BankMock({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation()
  const Workspace = pathname === '/news' ? PersonalWorkspace : BusinessWorkspace
  const [dialog, setDialog] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  function show(title: string) { setDialog(title); setMenuOpen(false) }
  return <div className="bank-shell">
    <a className="bank-skip" href="#bank-main">К содержимому</a>
    <header className="bank-header">
      <Link to="/" className="bank-brand" aria-label="Альфа-Бизнес — главная"><img className="bank-logo" src={alfaLogo} alt="" width={32} height={32} /><strong>Альфа-Бизнес</strong></Link>
      <div className="bank-header-controls">
        <Button variant="ghost" size="icon" className="bank-icon-button" aria-label="Сообщения" onClick={() => show('Сообщения')}><Icon icon={Mail01Icon} /></Button>
        <Button variant="ghost" size="icon" className="bank-icon-button" aria-label="Уведомления" onClick={() => show('Уведомления')}><Icon icon={Notification03Icon} /></Button>
        <span className="bank-header-divider" />
        <BusinessSelector />
        <Button className="bank-boss" onClick={() => show('Альфа Босс')}><span className="bank-avatar"><Icon icon={Contact01Icon} size={18} /></span>Альфа Босс</Button>
        <span className="bank-header-divider" />
        <Button variant="ghost" size="icon" className="bank-icon-button bank-logout" aria-label="Выход" onClick={() => show('Выход')}><Icon icon={Logout03Icon} /></Button>
      </div>
      <Button variant="ghost" size="icon" className="bank-mobile-toggle" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} aria-controls="bank-sidebar" onClick={() => setMenuOpen(!menuOpen)}><Icon icon={menuOpen ? Cancel01Icon : Menu01Icon} size={22} /></Button>
    </header>
    {menuOpen && <button className="bank-mobile-backdrop" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />}
    <aside className={`bank-sidebar ${menuOpen ? 'is-open' : ''}`} id="bank-sidebar">
      <Button variant="ghost" className="bank-all-services" onClick={() => show('Все сервисы')}><Icon icon={DashboardSquareAddIcon} size={19} />Все сервисы</Button>
      <nav aria-label="Банковские сервисы" className="bank-navigation"><Button asChild variant="ghost" className="bank-nav-item"><Link to="/news" aria-current={children ? "page" : undefined} onClick={() => setMenuOpen(false)}><Icon icon={File01Icon} size={17} /><span>Ньюсрум</span><span className="bank-new-badge">НОВОЕ</span></Link></Button>{navigation.map(item => <Button key={item.text} variant="ghost" className="bank-nav-item" onClick={() => show(item.text)}><Icon icon={item.icon} size={17} /><span>{item.text}</span></Button>)}<div className="bank-nav-separator" /><Button variant="ghost" className="bank-nav-item bank-procurement" onClick={() => show('Госзакупки')}><Icon icon={ReceiptDollarIcon} size={19} /><span>Госзакупки</span></Button></nav>
      <Button variant="ghost" className="bank-menu-settings" onClick={() => show('Настроить меню')}><Icon icon={Settings01Icon} size={17} />Настроить меню</Button>
    </aside>
    <main className={`bank-main ${children ? 'bank-news-main' : ''}`} id="bank-main" tabIndex={-1}>
      <Workspace>
      {!children && <><h1 className="bank-sr-only">Альфа-Бизнес — демонстрационный макет</h1>
      <div className="bank-actions"><Button className="bank-action" variant="secondary" onClick={() => show('Скачать выписку')}><Icon icon={FileDownloadIcon} />Скачать выписку</Button><Button className="bank-action" variant="secondary" onClick={() => show('Импорт платежей')}><Icon icon={FileImportIcon} />Импорт платежей</Button><Button className="bank-action" variant="secondary" onClick={() => show('Создать платёж')}><Icon icon={DocumentValidationIcon} />Создать платёж</Button><Button className="bank-action bank-more" variant="secondary" onClick={() => show('Ещё')}>Ещё</Button></div>
      <MockWorkspace /></>}
      {children}
      </Workspace>
    </main>
    <Button className="bank-chat" size="icon" aria-label="Чат поддержки — одно уведомление" onClick={() => show('Чат поддержки')}><Icon icon={Message01Icon} size={25} /><span>1</span></Button>
    <Dialog open={!!dialog} onOpenChange={open => { if (!open) setDialog('') }}><DialogContent><DialogTitle>{dialog}</DialogTitle><DialogDescription>Это демонстрационный макет. Банковские операции недоступны.</DialogDescription>{dialog === 'Все сервисы' && <Link className="bank-news-link" to="/news"><Icon icon={File01Icon} />Обзор новостей<Icon icon={ArrowRight01Icon} /></Link>}<DialogClose asChild><Button className="bank-dialog-close" variant="secondary">Понятно</Button></DialogClose></DialogContent></Dialog>
  </div>
}
