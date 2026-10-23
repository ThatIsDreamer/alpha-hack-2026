import { useSyncExternalStore } from 'react'
import { getSelectedBusinessId, useSelectedBusinessId } from './business-selection'

const EVENT = 'alfa-member-selection'
const fallback = new Map<string, string>()
export function getSelectedMemberId(businessId = getSelectedBusinessId() || '') {
  try { return localStorage.getItem(`alfa.demo-member:${businessId}`) || 'member-1' }
  catch { return fallback.get(businessId) || 'member-1' }
}
export function selectMember(businessId: string, id: string) {
  fallback.set(businessId, id)
  try { localStorage.setItem(`alfa.demo-member:${businessId}`, id) } catch { /* Session fallback. */ }
  window.dispatchEvent(new Event(EVENT))
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback); window.addEventListener('storage', callback)
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback) }
}
export function useSelectedMemberId() {
  const businessId = useSelectedBusinessId() || ''
  return useSyncExternalStore(subscribe, () => getSelectedMemberId(businessId), () => 'member-1')
}
