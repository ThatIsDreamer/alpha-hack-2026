import { getSelectedBusinessId } from './business-selection'

export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, options)
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось выполнить запрос. Попробуйте ещё раз.')
  return data
}

/** Use for every future recommendation call. No recommendation route exists yet.
 * Resolve selection at call time so a company switch cannot send a stale ID.
 */
export function recommendationRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const id = getSelectedBusinessId()
  if (!id) return Promise.reject(new Error('Сначала выберите компанию.'))
  const headers = new Headers(options.headers)
  headers.set('X-Business-ID', id)
  return apiRequest<T>(path, { ...options, headers })
}
