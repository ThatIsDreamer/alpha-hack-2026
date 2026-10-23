import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon } from '@hugeicons/core-free-icons'
import './SourceLogo.css'

const bundledSources = new Set(['lenta', 'kommersant', 'rbc', 'rosstat', 'moex', 'cbr', 'pravo', 'vedomosti', 'worldbank-commodities', 'gdelt-russian'])

/** Local brand assets for configured sources; domain favicon for future publishers. */
export function SourceLogo({ id, type, url, size = 20 }: { id: string; type: string; url?: string; size?: number }) {
  let src = ''
  if (type === 'telegram') src = '/source-icons/telegram.svg'
  else if (bundledSources.has(id)) src = `/source-icons/${id}.png`
  else if (url) {
    try {
      const parsed = new URL(url)
      if (['http:', 'https:'].includes(parsed.protocol)) src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`
    } catch { /* Invalid/missing source URL uses the neutral fallback. */ }
  }
  const [failedSrc, setFailedSrc] = useState('')
  return <span className="source-logo" style={{ width: size, height: size }} aria-hidden="true">
    {src && failedSrc !== src ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} /> : <HugeiconsIcon icon={Globe02Icon} size={size} strokeWidth={1.6} />}
  </span>
}
