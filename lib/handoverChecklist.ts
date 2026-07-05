// The Zero-Defect Handover ("Blue Tape") pre-handover walkthrough - the checklist CONTENT
// (from Formation's SOP document) plus the per-project state types. The foreman completes it
// in the cockpit as the job nears completion; the PDF export mirrors the original document.

export interface HandoverItemDef {
  key: string
  label: string
  detail: string
}

export interface HandoverSectionDef {
  key: string
  title: string
  intro?: string
  items: HandoverItemDef[]
}

export const HANDOVER_SECTIONS: HandoverSectionDef[] = [
  {
    key: 'hardscape',
    title: 'Hardscaping & Structural Integrity',
    intro: 'Focus on the "Touch Test" - surfaces should be smooth, level, and clean.',
    items: [
      { key: 'paving', label: 'Paving & Cladding', detail: 'Check for loose pavers, consistent grout lines, and haunching depth' },
      { key: 'grout', label: 'Grout & Caulking', detail: 'No pinholes, cracking, or haze. Expansion joints neat and colour-matched' },
      { key: 'sealing', label: 'Sealing', detail: 'Confirm uniform coverage. No "pooling" or missed spots on stone' },
      { key: 'timber', label: 'Timber / Screens', detail: 'All fixings countersunk; no burrs. Check batten alignment by eye' },
      { key: 'gates', label: 'Gates & Doors', detail: 'Test swing/latch 5x. Ensure zero "dragging" on the ground' },
      { key: 'concrete', label: 'In Situ Concrete', detail: 'Inspect arris edges for chips. Check for trowel marks or discolouration' },
      { key: 'pool_barriers', label: 'Pool Barriers', detail: 'Glass must be streak-free. Steel rods checked for "rattle" and plumb' },
    ],
  },
  {
    key: 'landscape',
    title: 'Landscape, Irrigation & Horticulture',
    intro: 'The garden should look established and manicured, not "just finished". Straighten leaners and stakes (invisible from the street); mulch flat and level with edging, none on paths; irrigation lines buried and invisible.',
    items: [
      { key: 'system_test', label: 'System Test', detail: 'Run every zone. Confirm run times tested and coverage suits the plant species and soil conditions' },
      { key: 'solenoids', label: 'Solenoid Boxes', detail: 'Lids painted black (if in garden). Interiors free of mud and debris' },
      { key: 'plant_health', label: 'Plant Health', detail: 'Confirm Seasol and fertiliser application. Look for signs of transplant shock' },
      { key: 'pots', label: 'Pots', detail: 'Centred and aligned. Cleaned with a damp cloth; no fertiliser salt stains. Placed on packers if required' },
      { key: 'irrigation_prog', label: 'Irrigation Programming', detail: 'All zones, programming schedule and run times documented. Controller settings verified and tested. Documentation ready for the PM handover pack' },
      { key: 'irrigation_plan', label: 'Irrigation Plan Document', detail: 'PM to prepare the irrigation plan summary for the client handover: zone map, watering schedule, seasonal adjustments, maintenance tips' },
    ],
  },
  {
    key: 'electrical',
    title: 'Electrical, Lighting & Mechanical',
    items: [
      { key: 'kitchen', label: 'Outdoor Kitchen', detail: 'Test BBQ. Plug in fridge and switch on. Spotless countertop and cabinetry surfaces (remove fingerprints)' },
      { key: 'pool_equipment', label: 'Pool Equipment', detail: 'Area swept. All PVC pipes labelled (if part of scope)' },
      { key: 'lights', label: 'Light Fittings', detail: 'Spike lights perfectly vertical, secure, equal distance off edging and level. Recessed and wall lights flush. Lenses clean, no fingerprints. Test each fitting for stability' },
      { key: 'cabling', label: 'Cabling & Conduit', detail: 'All cables neatly bundled and labelled. Zero visible cables or conduit in garden beds; runs concealed under mulch or behind structures' },
      { key: 'transformers', label: 'Transformers & Power', detail: 'Mounted level and secure, tucked away but accessible. No loose connections or corrosion. Individual circuits labelled' },
    ],
  },
  {
    key: 'presentation',
    title: 'Site Presentation & "White Glove" Clean',
    intro: 'The property should look like we were never there - except for the new garden.',
    items: [
      { key: 'fences', label: 'Fences', detail: 'Wipe down rails. No soil splash-back from recent rain or watering' },
      { key: 'nature_strip', label: 'Nature Strip', detail: 'Top-dressed and seeded. No stray gravel or rubble' },
      { key: 'debris', label: 'Debris Removal', detail: 'Every offcut, coffee cup, and spare screw removed from site' },
      { key: 'windows', label: 'Windows & Doors', detail: 'Clean all windows and doors around the works zone, including the front door and garage doors. Vacuum sliding door tracks - no "grit" noise' },
      { key: 'pressure_clean', label: 'Pressure Cleaning', detail: 'Crossover, gutter, footpath and all hard surfaces inside the project pressure washed or professionally cleaned' },
    ],
  },
  {
    key: 'admin',
    title: 'Final Admin & Handover Readiness',
    items: [
      { key: 'handover_pack', label: 'Handover Pack', detail: 'Materials list, irrigation plan and other relevant documentation ready for the client. Digital copies uploaded and shared' },
      { key: 'maintenance', label: 'Maintenance Schedule', detail: '3x monthly maintenance visits booked in the calendar. Client notified of timing' },
      { key: 'photos', label: 'Documentation', detail: 'Full suite of photos taken of the "Perfect State", uploaded and shared with the office' },
      { key: 'blue_tape_commitment', label: 'Blue Tape Sign-off', detail: 'Site Supervisor confirms all "Blue Tape" items will be rectified within 24 hours' },
    ],
  },
]

export const HANDOVER_ITEM_COUNT = HANDOVER_SECTIONS.reduce((s, sec) => s + sec.items.length, 0)

// ── Per-project state ─────────────────────────────────────────────────────────

export interface HandoverItemState {
  done: boolean
  note: string          // "Blue Tape issues"
  doneAt?: string
  doneBy?: string
}

export interface HandoverRow { a: string; b: string; c: string }   // free-table row (3 columns)

export interface HandoverData {
  items: Record<string, HandoverItemState>           // key = `${sectionKey}.${itemKey}`
  subbieTasks: HandoverRow[]                          // a=Sub contractor/Task, b=Status, c=Notes
  plantLog: HandoverRow[]                             // a=Plant location, b=Species, c=Reason for replacement
}

export interface HandoverChecklist {
  data: HandoverData
  signedOffBy: string | null
  signedOffAt: string | null
  updatedAt?: string
}

export function emptyHandoverData(): HandoverData {
  return { items: {}, subbieTasks: [], plantLog: [] }
}

export function handoverProgress(data: HandoverData): { done: number; total: number } {
  let done = 0
  for (const sec of HANDOVER_SECTIONS) for (const item of sec.items) {
    if (data.items[`${sec.key}.${item.key}`]?.done) done++
  }
  return { done, total: HANDOVER_ITEM_COUNT }
}
