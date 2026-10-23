import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Mascot, type MascotExpression } from './Mascot'
import { SourceLogo } from './SourceLogo'
import { Button } from './ui/button'

type Part = { text: string; source?: { id: string; type: string } }
const messages: { expression: MascotExpression; parts: Part[] }[] = [
  { expression: 'happy', parts: [{ text: 'Привет! Я помогу настроить Ньюсрум для вашей компании. Соберу важные новости и предложу, что можно сделать в Альфа-Бизнесе.' }] },
  { expression: 'curious-right', parts: [
    { text: 'Я читаю публичные каналы в ' },
    { text: 'Telegram', source: { id: 'telegram', type: 'telegram' } },
    { text: ', новостные сайты и RSS-ленты. Например, ' },
    { text: 'РБК', source: { id: 'rbc', type: 'rss' } },
    { text: ' и ' },
    { text: 'Коммерсантъ', source: { id: 'kommersant', type: 'rss' } },
    { text: '. У каждой рекомендации будут ссылки на новости, на которых она основана.' },
  ] },
  { expression: 'attentive', parts: [{ text: 'Сначала уточним, чем занимается компания и какие задачи для неё важны. Затем выберем источники новостей. Контекст и источники сохранятся для этой компании — их можно изменить позже.' }] },
]

export function OnboardingIntro({ onComplete }: { onComplete: () => void }) {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const message = messages[step]
  const fullText = message.parts.map(part => part.text).join('')
  return <div className="onboarding-conversation">
    <div className="onboarding-mascot"><Mascot size={132} expression={message.expression} /></div>
    <div className="onboarding-chat">
      <div className="onboarding-message-stage">
        <AnimatePresence mode="wait">
          <motion.p key={step} className="onboarding-chat-text" aria-hidden="true"
            initial={{ opacity: 0, y: reduced ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -8, transition: { duration: 0.12 } }}
            transition={{ y: { type: 'spring', duration: 0.5, bounce: 0.3 }, opacity: { duration: 0.18 } }}>
            {message.parts.map((part, index) => part.source
              ? <span key={index} className="onboarding-inline-source"><SourceLogo {...part.source} size={22} />{part.text}</span>
              : <span key={index}>{part.text}</span>)}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="bank-sr-only" aria-live="polite" aria-atomic="true">{fullText}</p>
      <div className="onboarding-chat-actions">
        <button type="button" className="onboarding-skip" onClick={onComplete}>Сразу к настройке</button>
        <Button onClick={() => {
          if (step === messages.length - 1) { onComplete(); return }
          setStep(value => value + 1)
        }}>{step === messages.length - 1 ? 'Уточнить бизнес' : 'Дальше'}</Button>
      </div>
    </div>
  </div>
}
