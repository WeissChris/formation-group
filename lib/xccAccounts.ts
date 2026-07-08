// The curated set of Xero expense accounts Chris budgets projects against (the XCC picker). Xero's
// full chart of accounts carries many more (admin overheads, bank fees, etc); the picker is reduced
// to just these project cost buckets so estimators only see what belongs on a job. To change what's
// selectable, edit this list - matching against Xero is by name, case- and whitespace-insensitive.

export const XCC_ALLOWED_ACCOUNTS: string[] = [
  'Basketball court',
  'Concrete',
  'Construction & Hardware Costs',
  'DBI - Insurance',
  'Engineering and Consulting fees',
  'Equipment rental expense',
  'Excavation',
  'Fence - Pool',
  'Fences and Gates',
  'Freight paid',
  'Garden accessories',
  'Irrigation',
  'Labour hire',
  'Lighting',
  'Materials & supplies',
  'OHS cost onsite',
  'Paving - Materials',
  'Paving - Supply',
  'Permits & licenses',
  'Planting materials',
  'Plants purchased',
  'Plumbing & drainage',
  'Rubbish removal',
  'Subcontractors',
  'Tools/equipment',
  'Warranty',
  'Wages & Salaries',
  'Workcover (Workers Compensation) - Production',
]

// Normalise for matching: case-insensitive, whitespace-collapsed, and treat "&" and the word "and" as
// the same (Xero's "Wages and Salaries" must match the sheet's "Wages & Salaries", etc).
const norm = (s: string) => (s || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\s+/g, ' ')
  .trim()
const ALLOWED = new Set(XCC_ALLOWED_ACCOUNTS.map(norm))

/** True if a Xero account name is one of the curated project cost buckets. */
export function isAllowedXccAccount(name: string): boolean {
  return ALLOWED.has(norm(name))
}
