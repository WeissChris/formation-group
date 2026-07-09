// The client handover booklet: an editable, print-styled document handed over at the end of a job.
// Built from the marked-up irrigation plan (see irrigationPlan.ts) plus editable prose the foreman
// tweaks per job. Section defaults below seed a new booklet; everything is editable in the page.
// Australian English, ASCII only.

export interface CareGuide { id: string; element: string; body: string }
export interface ZoneScheduleRow { id: string; zone: string; waters: string; runtime: string }
export interface SupplierRow { id: string; trade: string; name: string; phone: string }

export interface HandoverBookletData {
  welcomeGreeting?: string
  welcomeBody?: string
  materials?: string                 // materials used - product names / specs (free text)
  zoneSchedule?: ZoneScheduleRow[]    // seeded from the irrigation zones
  controllerGuide?: string
  careGuides?: CareGuide[]            // seeded from DEFAULT_CARE_GUIDES; foreman prunes to this job
  warranty?: string
  suppliers?: SupplierRow[]           // seeded from the project subbies
  sentAt?: string
  sentBy?: string
}

export const DEFAULT_WELCOME_BODY =
  "Thank you for choosing Formation to turn your outdoor space into reality. It has been our pleasure " +
  "working alongside you. This booklet is a short guide to your new landscape: the materials and plants " +
  "we used, how to care for each part so it looks its best for years to come, your irrigation zones and " +
  "how to run them, warranty details, and the contacts for the suppliers and trades who helped along the way."

export const DEFAULT_CONTROLLER_GUIDE =
  "Your irrigation runs on an automatic controller. Each station (zone) waters a different part of the " +
  "garden - see the plan and zone schedule opposite. To adjust: set each zone's run time and the days it " +
  "waters on the controller. Water early morning (before 8am) to reduce evaporation and comply with any " +
  "water restrictions. Increase run times over the first 6 to 8 weeks while new plants and lawn establish, " +
  "then ease back. Check the system monthly for blocked or misdirected drippers and sprays."

export const DEFAULT_WARRANTY =
  "Formation warrants all landscape construction and workmanship for 12 months from practical completion, " +
  "and honours the manufacturer's warranty on supplied products and appliances. Plants are guaranteed to " +
  "establish provided the irrigation and care instructions in this booklet are followed; loss caused by " +
  "under- or over-watering, pests, frost, or lack of maintenance is not covered. To make a warranty claim, " +
  "contact our office with photos and a description of the issue and we will arrange an inspection."

// Per-element care guides. Seeded into a new booklet; the foreman keeps the ones relevant to the job.
export const DEFAULT_CARE_GUIDES: Omit<CareGuide, 'id'>[] = [
  { element: 'Paving & tiling', body: 'Sweep and hose regularly. Wash down with warm water and a soft broom; use a pH-neutral cleaner for stubborn marks - avoid acid and high-pressure washing, which can strip sealer and grout. Reseal every 2 to 3 years, or sooner in high-traffic areas. Wipe up oil, wine and leaf stains promptly.' },
  { element: 'In-situ concrete', body: 'Concrete cures and lightens over its first weeks and may show minor hairline cracking - this is normal and not a defect. Keep it clean with water and a mild detergent. Reseal decorative and coloured concrete every 2 to 3 years to protect the finish and colour.' },
  { element: 'Planting & garden beds', body: 'Water in well while plants establish (see the irrigation guide). Mulch to about 75mm each spring to hold moisture and suppress weeds, keeping it clear of trunks and stems. Feed with a slow-release fertiliser in spring and autumn. Prune to shape after flowering and remove spent growth.' },
  { element: 'Lawn & turf', body: 'Water deeply and less often once established to encourage deep roots. Mow regularly, never removing more than a third of the leaf at once. Fertilise in spring and autumn and de-thatch or aerate yearly if it feels spongy. Keep an eye out for lawn grubs in warm months.' },
  { element: 'Timber & decking', body: 'Keep clear of leaf litter and hose down regularly. Oil natural timber every 6 to 12 months to protect it and even out weathering - clean and let dry fully first. Composite decking needs only washing with warm soapy water. Some movement, checking and colour change in natural timber is normal.' },
  { element: 'Irrigation', body: 'Run through each zone monthly to check for blocked, broken or misaligned drippers and sprays. Flush filters seasonally. Shut down and drain before frosts if applicable. Adjust run times with the seasons - more in summer, less in winter.' },
  { element: 'Lighting', body: 'Wipe fittings occasionally to keep lenses clear. LED globes are long-life but replace like-for-like when needed. If a run of lights fails, check the transformer and timer first. Keep plants trimmed back so they do not block or overheat fittings.' },
]

/** Build the seeded care guides with ids (used when a booklet has none yet). */
export function seedCareGuides(genId: () => string): CareGuide[] {
  return DEFAULT_CARE_GUIDES.map(g => ({ id: genId(), ...g }))
}

export const BOOKLET_TAGLINE = 'Inspired design, grounded in service.'
