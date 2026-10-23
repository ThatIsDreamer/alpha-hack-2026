import { useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Mascot } from './Mascot'

export function RecommendationMascot({ busy, disabled, hasActions, onRefresh }: {
  busy: boolean; disabled: boolean; hasActions: boolean; onRefresh: () => void
}) {
  const reduced = useReducedMotion()
  const gesture = useRef({ anchor: { x: 0, y: 0 }, direction: { x: 0, y: 0 }, distance: 0, turns: 0, started: 0 })
  return <div className="recommendation-guide">
    <motion.div className="recommendation-shake" drag
      dragSnapToOrigin dragMomentum={false}
      onDragStart={(_, info) => { gesture.current = { anchor: info.point, direction: { x: 0, y: 0 }, distance: 0, turns: 0, started: performance.now() } }}
      onDrag={(_, info) => {
        const g = gesture.current
        const dx = info.point.x - g.anchor.x
        const dy = info.point.y - g.anchor.y
        const distance = Math.hypot(dx, dy)
        if (distance < 22) return
        const direction = { x: dx / distance, y: dy / distance }
        const dot = direction.x * g.direction.x + direction.y * g.direction.y
        const hasDirection = g.direction.x !== 0 || g.direction.y !== 0
        if (hasDirection && dot < 0.5) {
          g.turns += 1
          g.direction = direction
        } else if (!hasDirection) g.direction = direction
        g.distance += distance
        g.anchor = info.point
      }}
      onDragEnd={() => {
        const g = gesture.current
        if (!disabled && g.turns >= 2 && g.distance >= 120 && performance.now() - g.started < 2500) onRefresh()
        g.turns = 0
      }}
      style={{ touchAction: 'none', position: 'relative', zIndex: 20 }}
      aria-hidden="true">
      <Mascot size={104} animated={!reduced} expression={busy ? 'attentive' : hasActions ? 'happy' : 'curious-right'} />
    </motion.div>
    <div><p className="recommendation-guide-message" role="status">{busy ? 'Изучаю новости и готовлю три предложения…' : hasActions ? 'Вот что можно сделать для вашей компании.' : 'Давайте найдём полезные действия для вашей компании.'}</p>
    <p className="recommendation-shake-hint">Перетащите меня по странице и потрясите в любом направлении или нажмите «{hasActions ? 'Обновить' : 'Подобрать действия'}». Новый подбор — не чаще раза в минуту.</p></div>
  </div>
}
