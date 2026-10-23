import { useEffect, type CSSProperties } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import backStar from '../assets/mascot/star-back.svg'
import frontStar from '../assets/mascot/star-front.svg'
import { DEFAULT_MASCOT_CONFIG, DEFAULT_MASCOT_EXPRESSION, type MascotConfig } from './mascot-config'
import './Mascot.css'

export { DEFAULT_MASCOT_CONFIG, DEFAULT_MASCOT_EXPRESSION, type MascotConfig } from './mascot-config'
export type MascotExpression = 'happy' | 'attentive' | 'curious-left' | 'curious-right'
export type MascotProps = {
  expression?: MascotExpression
  size?: number | string
  animated?: boolean
  config?: Partial<MascotConfig>
  className?: string
  /** Omit for decorative use; provide text when conveying a status. */
  label?: string
}

// Identical cubic topology lets Motion interpolate the actual filled eye outline.
// Bending a rounded capsule produces the happy eye without swapping SVG elements.
function eyePath(width: number, height: number, radius: number, bend = 0) {
  const w = width / 2, h = height / 2
  const r = Math.min(radius, w, h), k = 0.55228475
  const point = (x: number, y: number) =>
    `${x} ${y + bend * (0.25 - (x / w) ** 2 / 2)}`
  const curve = (...points: number[]) => 'C' + [0, 2, 4].map(i => point(points[i], points[i + 1])).join(' ')
  return 'M' + point(-w + r, -h)
    + curve((-w + r) / 3, -h, (w - r) / 3, -h, w - r, -h)
    + curve(w - r + r * k, -h, w, -h + r - r * k, w, -h + r)
    + curve(w, -h + r, w, h - r, w, h - r)
    + curve(w, h - r + r * k, w - r + r * k, h, w - r, h)
    + curve((w - r) / 3, h, (-w + r) / 3, h, -w + r, h)
    + curve(-w + r - r * k, h, -w, h - r + r * k, -w, h - r)
    + curve(-w, h - r, -w, -h + r, -w, -h + r)
    + curve(-w, -h + r - r * k, -w + r - r * k, -h, -w + r, -h) + 'Z'
}

// A constant-thickness circular stroke, expanded to eight cubic segments.
// Unlike warping a capsule, the two edges stay parallel and the caps stay round.
function happyEyePath(width: number, thickness: number, curve: number) {
  const r = Math.min(thickness / 2, width * 0.4)
  const span = Math.max(1, width - 2 * r)
  const halfAngle = Math.min(Math.max(0.001, curve / 24), 1.3,
    Math.asin(Math.min(1, span / (2 * (r + 0.5)))))
  const radius = span / (2 * Math.sin(halfAngle))
  const sag = radius * (1 - Math.cos(halfAngle))
  const cy = -radius + sag / 2
  const leftAngle = Math.PI / 2 + halfAngle
  const rightAngle = Math.PI / 2 - halfAngle
  const point = (cx: number, y: number, rad: number, a: number) =>
    [cx + rad * Math.cos(a), y + rad * Math.sin(a)]
  const start = point(0, cy, radius - r, leftAngle)
  let path = `M${start[0]} ${start[1]}`
  function arc(cx: number, y: number, rad: number, from: number, to: number) {
    const k = 4 / 3 * Math.tan((to - from) / 4)
    const a = point(cx, y, rad, from), b = point(cx, y, rad, to)
    path += `C${a[0] - k * rad * Math.sin(from)} ${a[1] + k * rad * Math.cos(from)} ${b[0] + k * rad * Math.sin(to)} ${b[1] - k * rad * Math.cos(to)} ${b[0]} ${b[1]}`
  }
  arc(0, cy, radius - r, leftAngle, Math.PI / 2)
  arc(0, cy, radius - r, Math.PI / 2, rightAngle)
  const right = point(0, cy, radius, rightAngle)
  arc(right[0], right[1], r, rightAngle - Math.PI, rightAngle - Math.PI / 2)
  arc(right[0], right[1], r, rightAngle - Math.PI / 2, rightAngle)
  arc(0, cy, radius + r, rightAngle, Math.PI / 2)
  arc(0, cy, radius + r, Math.PI / 2, leftAngle)
  const left = point(0, cy, radius, leftAngle)
  arc(left[0], left[1], r, leftAngle, leftAngle + Math.PI / 2)
  arc(left[0], left[1], r, leftAngle + Math.PI / 2, leftAngle + Math.PI)
  return path + 'Z'
}

function MorphEye({ target, frames, duration, bounce, loopDuration, times }: {
  target: string; frames?: string[]; duration: number; bounce: number; loopDuration: number; times: number[]
}) {
  const controls = useAnimationControls()
  const framesKey = JSON.stringify(frames)
  const timesKey = JSON.stringify(times)
  useEffect(() => {
    let cancelled = false
    void controls.start({ d: target, transition: duration > 0 ? { type: 'spring', duration, bounce } : { duration: 0 } }).then(() => {
      if (!cancelled && framesKey) {
        void controls.start({ d: JSON.parse(framesKey), transition: {
          duration: loopDuration, times: JSON.parse(timesKey), repeat: Infinity, ease: 'easeOut',
        } })
      }
    })
    return () => { cancelled = true; controls.stop() }
  }, [controls, target, framesKey, timesKey, duration, bounce, loopDuration])
  return <motion.path initial={{ d: target }} animate={controls} />
}

export function Mascot({ expression = DEFAULT_MASCOT_EXPRESSION, size = 202, animated = true, config, className = '', label }: MascotProps) {
  const c = { ...DEFAULT_MASCOT_CONFIG, ...config }
  const reducedMotion = useReducedMotion()
  const interest = expression.startsWith('curious')
  const gaze = interest && animated && c.gazeEnabled && !reducedMotion
  const direction = expression === 'curious-right' ? 1 : -1
  const distance = Math.max(0, c.gazeDistance) * direction
  const ratio = Math.max(0.1, Math.min(1, c.shortEyeHeight / c.eyeHeight))
  const left = expression === 'curious-left' ? ratio : 1
  const right = expression === 'curious-left' ? 1 : ratio
  const move = Math.max(0.1, c.gazeDuration)
  const hold = Math.max(0.01, c.gazeHold)
  const rest = Math.max(0.01, c.gazeCenterHold)
  const bounce = Math.max(0, Math.min(0.6, c.gazeBounce))
  const total = 3 * move + 2 * hold + rest
  const times = [0, move * 0.65, move, move + hold, move * 1.65 + hold,
    2 * move + hold, 2 * move + 2 * hold, 2.65 * move + 2 * hold,
    3 * move + 2 * hold, total].map(time => time / total)
  const timing = { duration: total, repeat: Infinity, times, ease: 'easeOut' as const }
  const positions = [0, distance * (1 + bounce), distance, distance,
    -distance * (1 + bounce), -distance, -distance, distance * bounce, 0, 0]
  const expressionDuration = animated && !reducedMotion ? Math.max(0, c.expressionBlend) : 0
  const expressionBounce = Math.max(0, Math.min(0.6, c.expressionBounce))
  const blend = expressionDuration > 0
    ? { type: 'spring' as const, duration: expressionDuration, bounce: expressionBounce }
    : { duration: 0 }
  const center = (c.eyeWidth + c.eyeGap) / 2
  return <span className={`mascot ${className}`} data-animated={animated && c.spinEnabled} data-expression={expression}
    style={{ '--mascot-size': typeof size === 'number' ? `${size}px` : size,
      '--mascot-back-duration': `${Math.max(1, c.backDuration)}s`, '--mascot-front-duration': `${Math.max(1, c.frontDuration)}s`,
      '--mascot-front-scale': `${c.frontScale * 100}%` } as CSSProperties}
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <img className="mascot-star mascot-star-back" src={backStar} alt="" draggable={false} />
    <span className="mascot-front-frame"><img className="mascot-star mascot-star-front" src={frontStar} alt="" draggable={false} /></span>
    <svg className="mascot-face" viewBox="0 0 202 200" fill="white" aria-hidden="true">
      <g transform={`translate(${101 + c.faceX} ${100 + c.faceY}) scale(${c.faceScale})`}>
        <motion.g initial={false} animate={{ x: gaze ? positions : 0,
          rotate: expression === 'attentive' ? c.attentionTilt : 0 }}
          transition={{ x: gaze ? { ...timing, delay: blend.duration } : blend, rotate: blend }}>
          {[-1, 1].map((side, index) => {
            const start = index === 0 ? left : right
            const end = index === 0 ? right : left
            const normal = eyePath(c.eyeWidth, c.eyeHeight, c.eyeRadius)
            const happy = happyEyePath(c.happyEyeWidth, c.happyStroke, c.happyCurve)
            const first = eyePath(c.eyeWidth, c.eyeHeight * start, c.eyeRadius)
            const second = eyePath(c.eyeWidth, c.eyeHeight * end, c.eyeRadius)
            const neutral = eyePath(c.centerEyeWidth, c.centerEyeHeight, c.eyeRadius)
            const target = expression === 'happy' ? happy : expression === 'attentive' ? normal : gaze ? neutral : first
            return <g key={side} transform={`translate(${side * center} 0)`}>
              <MorphEye target={target} frames={gaze ? [neutral, first, first, first, second, second, second, neutral, neutral, neutral] : undefined}
                duration={blend.duration} bounce={expressionBounce} loopDuration={total} times={times} />
            </g>
          })}
        </motion.g>
      </g>
    </svg>
  </span>
}
