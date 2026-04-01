const PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || 'formation2026'

export function checkPassword(input: string): boolean {
  return input === PASSWORD
}

export function setAuth(): void {
  if (typeof window !== 'undefined') localStorage.setItem('formation_auth', btoa(PASSWORD))
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('formation_auth') === btoa(PASSWORD)
}

export function signOut(): void {
  if (typeof window !== 'undefined') localStorage.removeItem('formation_auth')
}
