// Safety content manifest - the SWMS templates + SSSP questionnaire schemas, carried as static
// JSON in the repo (versioned with the code; no seeding/drift). Source: the Hazard Replacement
// planning content (D:\Dropbox\Hazard Replacement), drafted 2026-05-28.
//
// PRODUCTION GATE: every template is v0, AI-drafted, `_meta.approved_for_site_use: false`.
// They MUST be reviewed by a qualified Vic WHS practitioner before real-world reliance.

export interface SwmsTemplateControl { hoc_level: number; library_ref?: string; title: string }
export interface SwmsTemplateHazard {
  library_ref?: string
  title: string
  risk?: string
  default_severity?: string
  controls: SwmsTemplateControl[]
}
export interface SwmsTemplate {
  _meta?: { status?: string; approved_for_site_use?: boolean; review_warning?: string }
  activity_name: string
  high_risk_categories: string[]
  applicable_to_brands: string[]
  hazards: SwmsTemplateHazard[]
  ppe: { library_ref?: string; title: string }[]
  tasks: string[]
  signers_required?: { role: string; must_sign_before: string; count: number | string }[]
}

export interface SsspField {
  key: string
  label: string
  type: 'string' | 'phone' | 'enum' | 'boolean' | 'longtext' | 'multienum' | 'number' | 'table' | 'date' | 'email'
  required?: boolean
  options?: { value: string; label: string }[] | string[]
  columns?: { key: string; label: string; type?: string }[]
  help?: string
  default?: unknown
}
export interface SsspSchema {
  kind: string
  brand: string
  brandName: string
  templateVersion: string
  title: string
  subtitle?: string
  groups: { id: string; title: string; pdfSection?: boolean; fields: SsspField[] }[]
}

export const SWMS_TEMPLATES: { key: string; template: SwmsTemplate }[] = [
  { key: 'formation-bulk-earthworks', template: require('./templates/formation-bulk-earthworks-v0.json') as SwmsTemplate },
  { key: 'formation-carpentry-decks-screens', template: require('./templates/formation-carpentry-decks-screens-v0.json') as SwmsTemplate },
  { key: 'formation-concrete-slab-footing', template: require('./templates/formation-concrete-slab-footing-v0.json') as SwmsTemplate },
  { key: 'formation-irrigation-install', template: require('./templates/formation-irrigation-install-v0.json') as SwmsTemplate },
  { key: 'formation-landscape-demolition', template: require('./templates/formation-landscape-demolition-v0.json') as SwmsTemplate },
  { key: 'formation-landscape-lighting-electrical', template: require('./templates/formation-landscape-lighting-electrical-v0.json') as SwmsTemplate },
  { key: 'formation-paving-installation', template: require('./templates/formation-paving-installation-v0.json') as SwmsTemplate },
  { key: 'formation-pergola-structural-steel', template: require('./templates/formation-pergola-structural-steel-v0.json') as SwmsTemplate },
  { key: 'formation-planting-turf', template: require('./templates/formation-planting-turf-v0.json') as SwmsTemplate },
  { key: 'formation-retaining-wall-gt-2m', template: require('./templates/formation-retaining-wall-gt-2m-v0.json') as SwmsTemplate },
  { key: 'formation-retaining-wall-lt-2m', template: require('./templates/formation-retaining-wall-lt-2m-v0.json') as SwmsTemplate },
  { key: 'formation-stone-boulder-placement', template: require('./templates/formation-stone-boulder-placement-v0.json') as SwmsTemplate },
  { key: 'formation-tree-removal-pruning', template: require('./templates/formation-tree-removal-pruning-v0.json') as SwmsTemplate },
  { key: 'lume-pool-commissioning-water-fill', template: require('./templates/lume-pool-commissioning-water-fill-v0.json') as SwmsTemplate },
  { key: 'lume-pool-concrete-pour', template: require('./templates/lume-pool-concrete-pour-v0.json') as SwmsTemplate },
  { key: 'lume-pool-electrical-bonding', template: require('./templates/lume-pool-electrical-bonding-v0.json') as SwmsTemplate },
  { key: 'lume-pool-equipment-install', template: require('./templates/lume-pool-equipment-install-v0.json') as SwmsTemplate },
  { key: 'lume-pool-fence-barrier-install', template: require('./templates/lume-pool-fence-barrier-install-v0.json') as SwmsTemplate },
  { key: 'lume-pool-formwork', template: require('./templates/lume-pool-formwork-v0.json') as SwmsTemplate },
  { key: 'lume-pool-plumbing-rough-in', template: require('./templates/lume-pool-plumbing-rough-in-v0.json') as SwmsTemplate },
  { key: 'lume-pool-reinforcement', template: require('./templates/lume-pool-reinforcement-v0.json') as SwmsTemplate },
  { key: 'lume-pool-shell-excavation', template: require('./templates/lume-pool-shell-excavation-v0.json') as SwmsTemplate },
  { key: 'lume-pool-shoring-battered-cuts', template: require('./templates/lume-pool-shoring-battered-cuts-v0.json') as SwmsTemplate },
  { key: 'lume-pool-shotcrete', template: require('./templates/lume-pool-shotcrete-v0.json') as SwmsTemplate },
  { key: 'lume-pool-tiling-coping', template: require('./templates/lume-pool-tiling-coping-v0.json') as SwmsTemplate },
  { key: 'lume-working-near-completed-pool', template: require('./templates/lume-working-near-completed-pool-v0.json') as SwmsTemplate },
  { key: 'shared-site-setup-safety-barriers', template: require('./templates/shared-site-setup-safety-barriers-v0.json') as SwmsTemplate },
]

/** Templates applicable to an entity ('formation' | 'lume') - shared ones apply to both. */
export function templatesForEntity(entity: string): { key: string; template: SwmsTemplate }[] {
  return SWMS_TEMPLATES.filter(t =>
    t.template.applicable_to_brands.includes(entity) || t.key.startsWith('shared-'))
}

export const SSSP_SCHEMAS: Record<string, SsspSchema> = {
  formation: require('./sssp-formation-v1.json') as SsspSchema,
  lume: require('./sssp-lume-v1.json') as SsspSchema,
}
