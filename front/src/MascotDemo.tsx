import { useState } from 'react'
import { Mascot, DEFAULT_MASCOT_CONFIG, DEFAULT_MASCOT_EXPRESSION, type MascotConfig, type MascotExpression } from './components/Mascot'
import './MascotDemo.css'

const expressions: { value: MascotExpression; label: string }[] = [
  { value: 'happy', label: 'Радость' }, { value: 'attentive', label: 'Внимание' },
  { value: 'curious-left', label: 'Интерес · влево' }, { value: 'curious-right', label: 'Интерес · вправо' },
]
type NumberKey = { [K in keyof MascotConfig]: MascotConfig[K] extends number ? K : never }[keyof MascotConfig]
type Slider = { key: NumberKey; label: string; min: number; max: number; step?: number; unit?: string }
const groups: { title: string; sliders: Slider[] }[] = [
  { title: 'Смена выражения', sliders: [
    { key: 'expressionBounce', label: 'Пружинистость перехода', min: 0, max: 0.6, step: 0.01 },
    { key: 'expressionBlend', label: 'Длительность перехода', min: 0, max: 1, step: 0.01, unit: 'с' },
  ] },
  { title: 'Взгляд', sliders: [
    { key: 'gazeDistance', label: 'Размах', min: 0, max: 24, unit: 'px' },
    { key: 'gazeDuration', label: 'Длительность одного движения', min: 0.15, max: 1.5, step: 0.01, unit: 'с' },
    { key: 'gazeHold', label: 'Пауза сбоку', min: 0, max: 1.5, step: 0.01, unit: 'с' },
    { key: 'gazeCenterHold', label: 'Пауза в центре', min: 0, max: 5, step: 0.1, unit: 'с' },
    { key: 'gazeBounce', label: 'Пружинистость', min: 0, max: 0.6, step: 0.01 },
    { key: 'centerEyeWidth', label: 'Ширина глаз в центре', min: 14, max: 38, unit: 'px' },
    { key: 'centerEyeHeight', label: 'Высота глаз в центре', min: 14, max: 40, unit: 'px' },
  ] },
  { title: 'Глаза', sliders: [
    { key: 'eyeWidth', label: 'Ширина', min: 14, max: 38, unit: 'px' },
    { key: 'eyeHeight', label: 'Высота', min: 24, max: 48, unit: 'px' },
    { key: 'shortEyeHeight', label: 'Высота короткого глаза', min: 10, max: 36, unit: 'px' },
    { key: 'eyeGap', label: 'Расстояние между глазами', min: 6, max: 28, unit: 'px' },
    { key: 'eyeRadius', label: 'Скругление', min: 0, max: 18, unit: 'px' },
    { key: 'attentionTilt', label: 'Наклон внимания', min: -25, max: 25, unit: '°' },
    { key: 'happyEyeWidth', label: 'Ширина глаз радости', min: 10, max: 40, unit: 'px' },
    { key: 'happyCurve', label: 'Изгиб радости', min: 0, max: 32, unit: 'px' },
    { key: 'happyStroke', label: 'Толщина радости', min: 4, max: 16, unit: 'px' },
  ] },
  { title: 'Положение лица', sliders: [
    { key: 'faceScale', label: 'Масштаб', min: 0.6, max: 1.3, step: 0.01 },
    { key: 'faceX', label: 'По горизонтали', min: -20, max: 20, unit: 'px' },
    { key: 'faceY', label: 'По вертикали', min: -25, max: 25, unit: 'px' },
  ] },
  { title: 'Звёзды', sliders: [
    { key: 'backDuration', label: 'Оборот серой звезды', min: 10, max: 100, unit: 'с' },
    { key: 'frontDuration', label: 'Оборот красной звезды', min: 10, max: 100, unit: 'с' },
    { key: 'frontScale', label: 'Размер красной звезды', min: 0.6, max: 0.9, step: 0.01 },
  ] },
]
export default function MascotDemo() {
  const [expression, setExpression] = useState<MascotExpression>(DEFAULT_MASCOT_EXPRESSION)
  const [config, setConfig] = useState<MascotConfig>({ ...DEFAULT_MASCOT_CONFIG })
  const [copyStatus, setCopyStatus] = useState('')
  const json = JSON.stringify({ expression, config }, null, 2)
  function update<K extends keyof MascotConfig>(key: K, value: MascotConfig[K]) { setConfig(current => ({ ...current, [key]: value })); setCopyStatus('') }
  async function copy() {
    try { await navigator.clipboard.writeText(json); setCopyStatus('JSON скопирован') }
    catch { setCopyStatus('Выделите JSON ниже и скопируйте вручную') }
  }
  return <main className="mascot-demo" id="mascot-demo-main" tabIndex={-1}>
    <div className="mascot-demo-heading"><h1>Настроить маскота</h1><p>Подберите характер движения и сохраните параметры.</p></div>
    <div className="mascot-workbench"><section className="mascot-preview" aria-label="Предпросмотр">
      <div className="mascot-demo-stage"><Mascot expression={expression} config={config} size="min(300px, 65vw)" label={expressions.find(item => item.value === expression)?.label} /></div>
      <fieldset className="mascot-demo-controls"><legend>Выражение</legend><div>{expressions.map(item => <label key={item.value}><input type="radio" name="expression" value={item.value} checked={expression === item.value} onChange={() => { setExpression(item.value); setCopyStatus('') }} /><span>{item.label}</span></label>)}</div></fieldset>
      <div className="mascot-demo-lineup" aria-label="Все выражения">{expressions.map(item => <div key={item.value}><Mascot expression={item.value} config={config} size={70} animated={false} /><span>{item.label}</span></div>)}</div>
      <p className="mascot-demo-reduced">При уменьшении движения в системе анимация отключена.</p>
    </section><section className="mascot-settings" aria-label="Параметры маскота">
      <div className="mascot-toggles"><label><input type="checkbox" checked={config.gazeEnabled} onChange={e => update('gazeEnabled', e.target.checked)} />Движение взгляда</label><label><input type="checkbox" checked={config.spinEnabled} onChange={e => update('spinEnabled', e.target.checked)} />Вращение звёзд</label></div>
      {groups.map(group => <fieldset key={group.title}><legend>{group.title}</legend>{group.sliders.map(slider => <label className="mascot-slider" key={slider.key} htmlFor={`mascot-${slider.key}`}><span>{slider.label}<output>{config[slider.key]}{slider.unit && ` ${slider.unit}`}</output></span><input id={`mascot-${slider.key}`} type="range" min={slider.min} max={slider.max} step={slider.step || 1} value={config[slider.key]} onChange={e => update(slider.key, Number(e.target.value))} /></label>)}</fieldset>)}
      <div className="mascot-json-actions"><button type="button" onClick={copy}>Скопировать JSON</button><button type="button" onClick={() => { setConfig({ ...DEFAULT_MASCOT_CONFIG }); setExpression(DEFAULT_MASCOT_EXPRESSION); setCopyStatus('') }}>Сбросить</button></div><p className="mascot-copy-status" role="status">{copyStatus}</p>
      <details className="mascot-json"><summary>Параметры JSON</summary><textarea aria-label="Параметры маскота в JSON" readOnly value={json} spellCheck={false} onFocus={e => e.target.select()} /></details>
    </section></div>
  </main>
}
