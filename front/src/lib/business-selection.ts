import { useSyncExternalStore } from 'react'

const KEY = 'alfa.selected-business-id'
const EVENT = 'alfa-business-selection'
let fallback: string | null = null

export function getSelectedBusinessId(): string | null {
  try { return window.localStorage.getItem(KEY) || null } catch { return fallback }
}
export function selectBusiness(id: string | null) {
  fallback = id
  try {
    if (id) window.localStorage.setItem(KEY, id)
    else window.localStorage.removeItem(KEY)
  } catch { /* Private/storage-restricted browsers keep selection for this session. */ }
  window.dispatchEvent(new Event(EVENT))
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback) }
}
export function useSelectedBusinessId() {
  return useSyncExternalStore(subscribe, getSelectedBusinessId, () => null)
}
