import type { Project, WeeklyRevenue, Estimate, EstimateLineItem, DesignProposal, DesignProject } from '@/types'
import type { ProjectStage } from '@/types'
import { saveProject, saveEstimate, loadProjects, loadEstimates, saveProposal, loadProposals, generateRevenueFromProposal, saveDesignProject, loadDesignProjectByProposalId, loadDesignProjects, saveProgressPaymentStage, loadProgressPaymentStages } from '@/lib/storage'
import { generateId } from '@/lib/utils'

export function seedDemoData(): void {
  const projects: Project[] = [
    {
      id: '1',
      entity: 'formation',
      name: 'Beach',
      address: 'Beach Rd, Brighton',
      clientName: 'Beach Residence',
      status: 'active',
      stage: 'active' as ProjectStage,
      contractValue: 850000,
      startDate: '2025-07-01',
      plannedCompletion: '2026-09-30',
      foreman: 'CAM',
      foremanPin: 'BEACH-CAM-2026',
      notes: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      entity: 'formation',
      name: 'Templestowe \u2013 Tim Hockham',
      address: '165 Serpells Road, Templestowe VIC',
      clientName: 'Tim Hockham',
      status: 'active',
      stage: 'active' as ProjectStage,
      contractValue: 420000,
      startDate: '2025-12-01',
      plannedCompletion: '2026-05-30',
      foreman: 'CAM',
      foremanPin: 'SERPELLS-CAM-2026',
      notes: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: '3',
      entity: 'formation',
      name: 'Clifton',
      address: 'Clifton Ave, Toorak',
      clientName: 'Clifton Residence',
      status: 'active',
      stage: 'active' as ProjectStage,
      contractValue: 280000,
      startDate: '2026-01-15',
      plannedCompletion: '2026-06-30',
      foreman: 'CAM',
      foremanPin: 'CLIFTON-CAM-2026',
      notes: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: '4',
      entity: 'formation',
      name: 'St Kilda \u2013 Mark Davis',
      address: '5 Sidwell Ave, East St Kilda VIC',
      clientName: 'Mark and Laura Davis',
      status: 'active',
      stage: 'active' as ProjectStage,
      contractValue: 320000,
      startDate: '2025-10-01',
      plannedCompletion: '2026-04-30',
      foreman: 'CAM',
      foremanPin: 'SIDWELL-CAM-2026',
      notes: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: '5',
      entity: 'formation',
      name: 'Burnside \u2013 Paul Ramondetta',
      address: '16 Samara Road, Burnside VIC',
      clientName: 'Paul and Ulrika Ramondetta',
      status: 'active',
      stage: 'completion' as ProjectStage,
      contractValue: 453530,
      startDate: '2025-07-01',
      plannedCompletion: '2026-05-30',
      foreman: 'CAM',
      foremanPin: 'SAMARA-CAM-2026',
      notes: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: '6',
      entity: 'lume',
      name: 'Burnside – Paul Ramondetta',
      address: '16 Samara Road, Burnside VIC',
      clientName: 'Paul and Ulrika Ramondetta',
      status: 'active',
      contractValue: 308654,
      startDate: '2025-08-01',
      plannedCompletion: '2026-06-30',
      foreman: 'Ryan',
      notes: 'Pool and landscape. Tiling phase.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'lume-sidwell',
      entity: 'lume',
      name: 'St Kilda \u2013 Mark Davis',
      address: '5 Sidwell Ave, East St Kilda VIC',
      clientName: 'Mark and Laura Davis',
      status: 'active',
      contractValue: 293291,
      startDate: '2025-10-01',
      plannedCompletion: '2026-06-30',
      foreman: 'Ryan',
      notes: 'Pool, deck, outdoor kitchen. Equipment fit-off.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'lume-amberly',
      entity: 'lume',
      name: 'Burnside \u2013 Steph and Dennis',
      address: 'Amberly Way Residence',
      clientName: 'Steph and Dennis',
      status: 'active',
      contractValue: 308654,
      startDate: '2025-03-01',
      plannedCompletion: '2026-04-30',
      foreman: 'Ryan',
      notes: 'Large pool with infinity edge and spa.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'lume-twomey',
      entity: 'lume',
      name: 'Twomey Residence',
      address: 'Twomey Residence VIC',
      clientName: 'Amelia and Nick Twomey',
      status: 'planning',
      contractValue: 116660,
      startDate: '',
      plannedCompletion: '',
      foreman: 'Ryan',
      notes: 'Pool with raised spa and infloor cleaning.',
      createdAt: new Date().toISOString(),
    },
  ]

  const revenue: WeeklyRevenue[] = [
    { id: 'r1', projectId: '5', projectName: 'Burnside \u2013 Paul Ramondetta', entity: 'formation', weekEnding: '2026-01-16', weekNumber: 2, plannedRevenue: 21000.40, actualInvoiced: 21000.40, isDeposit: false, notes: '' },
    { id: 'r2', projectId: '5', projectName: 'Burnside \u2013 Paul Ramondetta', entity: 'formation', weekEnding: '2026-03-13', weekNumber: 10, plannedRevenue: 35000.67, actualInvoiced: 0, isDeposit: false, notes: '' },
    { id: 'r3', projectId: '5', projectName: 'Burnside \u2013 Paul Ramondetta', entity: 'formation', weekEnding: '2026-04-03', weekNumber: 13, plannedRevenue: 31973.57, actualInvoiced: 0, isDeposit: false, notes: '' },
    { id: 'r4', projectId: '1', projectName: 'Beach', entity: 'formation', weekEnding: '2026-01-23', weekNumber: 3, plannedRevenue: 34119.56, actualInvoiced: 34119.56, isDeposit: false, notes: '' },
    { id: 'r5', projectId: '1', projectName: 'Beach', entity: 'formation', weekEnding: '2026-02-27', weekNumber: 7, plannedRevenue: 32258.97, actualInvoiced: 0, isDeposit: false, notes: '' },
    { id: 'r6', projectId: '1', projectName: 'Beach', entity: 'formation', weekEnding: '2026-03-27', weekNumber: 11, plannedRevenue: 100711.61, actualInvoiced: 0, isDeposit: false, notes: '' },
    { id: 'r7', projectId: '1', projectName: 'Beach', entity: 'formation', weekEnding: '2026-07-25', weekNumber: 17, plannedRevenue: 151100.72, actualInvoiced: 0, isDeposit: false, notes: '' },
    { id: 'r8', projectId: '1', projectName: 'Beach', entity: 'formation', weekEnding: '2026-08-28', weekNumber: 21, plannedRevenue: 201704.88, actualInvoiced: 0, isDeposit: false, notes: '' },
    { id: 'r9', projectId: '2', projectName: 'Templestowe \u2013 Tim Hockham', entity: 'formation', weekEnding: '2026-02-06', weekNumber: 5, plannedRevenue: 45000.00, actualInvoiced: 45000.00, isDeposit: true, notes: 'Deposit' },
    { id: 'r10', projectId: '2', projectName: 'Templestowe \u2013 Tim Hockham', entity: 'formation', weekEnding: '2026-03-20', weekNumber: 12, plannedRevenue: 85000.00, actualInvoiced: 0, isDeposit: false, notes: '' },
    { id: 'r11', projectId: '6', projectName: 'Poolside', entity: 'lume', weekEnding: '2026-02-13', weekNumber: 6, plannedRevenue: 30000.00, actualInvoiced: 30000.00, isDeposit: false, notes: '' },
    { id: 'r12', projectId: '6', projectName: 'Poolside', entity: 'lume', weekEnding: '2026-03-20', weekNumber: 12, plannedRevenue: 50000.00, actualInvoiced: 0, isDeposit: false, notes: '' },
  ]

  // Always update project names to match convention
  // Always update — merge with existing to preserve any extra fields (gantt, actuals etc)
  const existingProjects = loadProjects()
  const mergedProjects = projects.map(newP => {
    const existing = existingProjects.find(e => e.id === newP.id)
    return existing ? { ...existing, ...newP } : newP
  })
  // Keep any extra projects not in seed (user-created)
  const extraProjects = existingProjects.filter(e => !projects.find(p => p.id === e.id))
  localStorage.setItem('fg_projects', JSON.stringify([...mergedProjects, ...extraProjects]))
  localStorage.setItem('fg_revenue', JSON.stringify(revenue))
}

type RawLineItem = Omit<EstimateLineItem, 'id' | 'estimateId'>

export function seedQ1371Estimate(): void {
  const projectId = 'q1371'
  const estimateId = generateId()

  // Create project if it doesn't exist, or update if placeholder names
  const existingProjects = loadProjects()
  const existingQ1371 = existingProjects.find(p => p.id === projectId)
  if (!existingQ1371) {
    const project: Project = {
      id: projectId,
      entity: 'formation',
      name: 'Sorrento \u2013 Tony Joubert',
      address: '44 Ossett St, Sorrento VIC 3943',
      clientName: 'Jo and Tony Joubert',
      status: 'planning',
      contractValue: 0,
      startDate: new Date().toISOString().split('T')[0],
      plannedCompletion: '',
      foreman: '',
      notes: '',
      createdAt: new Date().toISOString(),
    }
    saveProject(project)
  } else if (existingQ1371.name === 'q1371' || existingQ1371.name === 'Joubert Residence' || existingQ1371.clientName === 'q1371 Client') {
    const allProjects = loadProjects()
    const proj = allProjects.find(p => p.id === 'q1371')
    if (proj) {
      proj.name = 'Sorrento \u2013 Tony Joubert'
      proj.clientName = 'Jo and Tony Joubert'
      proj.address = '44 Ossett St, Sorrento VIC 3943'
      localStorage.setItem('fg_projects', JSON.stringify(allProjects))
    }
  }

  const rawItems: RawLineItem[] = [
    { displayOrder: '1.1', category: 'Exposed aggregate driveway', description: 'Exposed aggregate driveway', type: 'Subcontractor', crewType: 'Subcontractor', units: 115, uom: 'm2', unitCost: 165, total: 18975, markupPercent: 48, revenue: 28083, notes: '' },
    { displayOrder: '2.1', category: 'In-situ concrete - Rear steppers', description: 'Formwork materials', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 100, total: 100, markupPercent: 58, revenue: 158, notes: '' },
    { displayOrder: '2.2', category: 'In-situ concrete - Rear steppers', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 1, uom: 'm3', unitCost: 350, total: 350, markupPercent: 58, revenue: 553, notes: '' },
    { displayOrder: '2.3', category: 'In-situ concrete - Rear steppers', description: 'Steel mesh', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 75, total: 75, markupPercent: 58, revenue: 118.5, notes: '' },
    { displayOrder: '2.4', category: 'In-situ concrete - Rear steppers', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 24, uom: 'hour', unitCost: 68, total: 1632, markupPercent: 88, revenue: 3068.16, notes: '' },
    { displayOrder: '3.1', category: 'In-situ concrete - Rear steps', description: 'Formwork materials', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 300, total: 300, markupPercent: 58, revenue: 474, notes: '' },
    { displayOrder: '3.2', category: 'In-situ concrete - Rear steps', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 2, uom: 'm3', unitCost: 400, total: 800, markupPercent: 58, revenue: 1264, notes: '' },
    { displayOrder: '3.3', category: 'In-situ concrete - Rear steps', description: 'Steel mesh', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 125, total: 125, markupPercent: 58, revenue: 197.5, notes: '' },
    { displayOrder: '3.4', category: 'In-situ concrete - Rear steps', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 48, uom: 'hour', unitCost: 68, total: 3264, markupPercent: 88, revenue: 6136.32, notes: '' },
    { displayOrder: '4.1', category: 'In-situ concrete - Bench seat', description: 'Formwork materials', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 300, total: 300, markupPercent: 58, revenue: 474, notes: '' },
    { displayOrder: '4.2', category: 'In-situ concrete - Bench seat', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 2, uom: 'm3', unitCost: 400, total: 800, markupPercent: 58, revenue: 1264, notes: '' },
    { displayOrder: '4.3', category: 'In-situ concrete - Bench seat', description: 'Steel mesh', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 125, total: 125, markupPercent: 58, revenue: 197.5, notes: '' },
    { displayOrder: '4.4', category: 'In-situ concrete - Bench seat', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 72, uom: 'hour', unitCost: 68, total: 4896, markupPercent: 88, revenue: 9204.48, notes: '' },
    { displayOrder: '5.1', category: 'In-situ concrete - Pumps', description: 'Concrete pump', type: 'Subcontractor', crewType: 'Subcontractor', units: 2, uom: 'Allowance', unitCost: 1100, total: 2200, markupPercent: 48, revenue: 3256, notes: '' },
    { displayOrder: '6.1', category: 'Sleeper wall - balance of wall and steps', description: 'Sleepers', type: 'Material', crewType: 'Formation', units: 18, uom: 'ea', unitCost: 32.5, total: 585, markupPercent: 58, revenue: 924.3, notes: '' },
    { displayOrder: '6.2', category: 'Sleeper wall - balance of wall and steps', description: 'C/H channels - 2.4m-1.4m', type: 'Material', crewType: 'Formation', units: 7, uom: 'Ea', unitCost: 75, total: 525, markupPercent: 58, revenue: 829.5, notes: '' },
    { displayOrder: '6.3', category: 'Sleeper wall - balance of wall and steps', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 1.8, uom: 'm3', unitCost: 350, total: 630, markupPercent: 58, revenue: 995.4, notes: '' },
    { displayOrder: '6.4', category: 'Sleeper wall - balance of wall and steps', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 40, uom: 'Hour', unitCost: 68, total: 2720, markupPercent: 88, revenue: 5113.6, notes: '' },
    { displayOrder: '6.5', category: 'Sleeper wall - balance of wall and steps', description: 'Machine to drill holes', type: 'Equipment', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 200, total: 200, markupPercent: 48, revenue: 296, notes: '' },
    { displayOrder: '6.6', category: 'Sleeper wall - balance of wall and steps', description: 'Coreflute', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 100, total: 100, markupPercent: 58, revenue: 158, notes: '' },
    { displayOrder: '7.1', category: 'Sleeper wall - sauna landing', description: 'Sleepers', type: 'Material', crewType: 'Formation', units: 18, uom: 'ea', unitCost: 32.5, total: 585, markupPercent: 58, revenue: 924.3, notes: '' },
    { displayOrder: '7.2', category: 'Sleeper wall - sauna landing', description: 'C/H channels - 2.4m', type: 'Material', crewType: 'Formation', units: 4, uom: 'Ea', unitCost: 100, total: 400, markupPercent: 58, revenue: 632, notes: '' },
    { displayOrder: '7.3', category: 'Sleeper wall - sauna landing', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 1, uom: 'm3', unitCost: 350, total: 350, markupPercent: 58, revenue: 553, notes: '' },
    { displayOrder: '7.4', category: 'Sleeper wall - sauna landing', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 28, uom: 'Hour', unitCost: 68, total: 1904, markupPercent: 88, revenue: 3579.52, notes: '' },
    { displayOrder: '7.5', category: 'Sleeper wall - sauna landing', description: 'Machine to drill holes', type: 'Equipment', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 200, total: 200, markupPercent: 48, revenue: 296, notes: '' },
    { displayOrder: '8.1', category: 'Soft Landscaping', description: 'Plant supply', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 19000, total: 19000, markupPercent: 68, revenue: 31920, notes: 'Crepe Myrtle 30cm x 3, Jacaranda 50cm x 1, Banksia sentinel x 94, Feature Olive x 3, Plants for front fence x 21, 500 groundcovers/grasses/shrubs' },
    { displayOrder: '8.2', category: 'Soft Landscaping', description: 'Plant delivery', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 400, total: 400, markupPercent: 53, revenue: 612, notes: '' },
    { displayOrder: '8.3', category: 'Soft Landscaping', description: 'Soil - 3 Way', type: 'Material', crewType: 'Formation', units: 30, uom: 'm3', unitCost: 125, total: 3750, markupPercent: 58, revenue: 5925, notes: '' },
    { displayOrder: '8.4', category: 'Soft Landscaping', description: 'Mulch', type: 'Material', crewType: 'Formation', units: 15, uom: 'm3', unitCost: 125, total: 1875, markupPercent: 58, revenue: 2962.5, notes: '' },
    { displayOrder: '8.5', category: 'Soft Landscaping', description: 'Lawn/toppings edging', type: 'Material', crewType: 'Formation', units: 120, uom: 'ln', unitCost: 25, total: 3000, markupPercent: 58, revenue: 4740, notes: '' },
    { displayOrder: '8.6', category: 'Soft Landscaping', description: 'Buffalo lawn', type: 'Material', crewType: 'Formation', units: 140, uom: 'm2', unitCost: 18, total: 2520, markupPercent: 58, revenue: 3981.6, notes: '' },
    { displayOrder: '8.7', category: 'Soft Landscaping', description: 'Turf sand', type: 'Material', crewType: 'Formation', units: 15, uom: 'm3', unitCost: 120, total: 1800, markupPercent: 58, revenue: 2844, notes: '' },
    { displayOrder: '8.8', category: 'Soft Landscaping', description: 'Boulders', type: 'Material', crewType: 'Formation', units: 30, uom: 'ea', unitCost: 70, total: 2100, markupPercent: 58, revenue: 3318, notes: '' },
    { displayOrder: '8.9', category: 'Soft Landscaping', description: 'Toppings', type: 'Material', crewType: 'Formation', units: 12, uom: 'm3', unitCost: 120, total: 1440, markupPercent: 58, revenue: 2275.2, notes: '' },
    { displayOrder: '8.10', category: 'Soft Landscaping', description: 'Labour - Garden bed preparation/edging', type: 'Labour', crewType: 'Formation', units: 120, uom: 'hour', unitCost: 68, total: 8160, markupPercent: 89.5, revenue: 15463.2, notes: '' },
    { displayOrder: '8.11', category: 'Soft Landscaping', description: 'Labour - Planting', type: 'Labour', crewType: 'Formation', units: 96, uom: 'hour', unitCost: 68, total: 6528, markupPercent: 89.5, revenue: 12370.56, notes: '' },
    { displayOrder: '8.12', category: 'Soft Landscaping', description: 'Labour - Mulching/Clean up', type: 'Labour', crewType: 'Formation', units: 72, uom: 'hour', unitCost: 68, total: 4896, markupPercent: 89.5, revenue: 9277.92, notes: '' },
    { displayOrder: '8.13', category: 'Soft Landscaping', description: 'Labour - Toppings', type: 'Labour', crewType: 'Formation', units: 32, uom: 'hour', unitCost: 68, total: 2176, markupPercent: 89.5, revenue: 4123.52, notes: '' },
    { displayOrder: '8.14', category: 'Soft Landscaping', description: 'Labour - Turf', type: 'Labour', crewType: 'Formation', units: 72, uom: 'hour', unitCost: 68, total: 4896, markupPercent: 89.5, revenue: 9277.92, notes: '' },
    { displayOrder: '8.15', category: 'Soft Landscaping', description: 'Machine Hire', type: 'Equipment', crewType: 'Formation', units: 4, uom: 'Day', unitCost: 300, total: 1200, markupPercent: 58, revenue: 1896, notes: '' },
    { displayOrder: '9.1', category: 'Irrigation', description: 'Large system', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 3000, total: 3000, markupPercent: 58, revenue: 4740, notes: '' },
    { displayOrder: '9.2', category: 'Irrigation', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 80, uom: 'hour', unitCost: 68, total: 5440, markupPercent: 88, revenue: 10227.2, notes: '' },
    { displayOrder: '10.1', category: 'Lighting', description: 'LED strip lights', type: 'Material', crewType: 'Formation', units: 20, uom: 'ea', unitCost: 110, total: 2200, markupPercent: 58, revenue: 3476, notes: '' },
    { displayOrder: '10.2', category: 'Lighting', description: 'LED strip', type: 'Material', crewType: 'Formation', units: 15, uom: 'lm', unitCost: 60, total: 900, markupPercent: 58, revenue: 1422, notes: '' },
    { displayOrder: '10.3', category: 'Lighting', description: 'Keo Horizon Inground Light', type: 'Material', crewType: 'Formation', units: 7, uom: 'each', unitCost: 135, total: 945, markupPercent: 58, revenue: 1493.1, notes: '' },
    { displayOrder: '10.4', category: 'Lighting', description: '4mm Cable', type: 'Material', crewType: 'Formation', units: 2, uom: 'Roll', unitCost: 250, total: 500, markupPercent: 58, revenue: 790, notes: '' },
    { displayOrder: '10.5', category: 'Lighting', description: 'Heat shrinks', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 75, total: 75, markupPercent: 58, revenue: 118.5, notes: '' },
    { displayOrder: '10.6', category: 'Lighting', description: 'Drivers', type: 'Material', crewType: 'Formation', units: 3, uom: 'each', unitCost: 175, total: 525, markupPercent: 58, revenue: 829.5, notes: '' },
    { displayOrder: '10.7', category: 'Lighting', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 45, uom: 'hour', unitCost: 68, total: 3060, markupPercent: 88, revenue: 5752.8, notes: '' },
    { displayOrder: '11.1', category: 'Outdoor kitchen', description: 'Outdoor kitchen (subcontractor)', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 14500, total: 14500, markupPercent: 48, revenue: 21460, notes: '' },
    { displayOrder: '12.1', category: 'Front fence', description: 'TD Built - front fence', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 27150, total: 27150, markupPercent: 43, revenue: 38824.5, notes: '' },
    { displayOrder: '12.2', category: 'Front fence', description: 'Survey pegs', type: 'Material', crewType: 'Formation', units: 30, uom: 'Ea', unitCost: 5, total: 150, markupPercent: 58, revenue: 237, notes: '' },
    { displayOrder: '12.3', category: 'Front fence', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 1.5, uom: 'm3', unitCost: 400, total: 600, markupPercent: 58, revenue: 948, notes: '' },
    { displayOrder: '12.4', category: 'Front fence', description: 'Render', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 1500, total: 1500, markupPercent: 48, revenue: 2220, notes: '' },
    { displayOrder: '12.5', category: 'Front fence', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 12, uom: 'hour', unitCost: 68, total: 816, markupPercent: 88, revenue: 1534.08, notes: '' },
    { displayOrder: '12.6', category: 'Front fence', description: 'Steel', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 250, total: 250, markupPercent: 58, revenue: 395, notes: '' },
    { displayOrder: '12.7', category: 'Front fence', description: 'Milkcan letterbox', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 550, total: 550, markupPercent: 58, revenue: 869, notes: '' },
    { displayOrder: '13.1', category: 'Bin screen/gate and southern side screen/gate', description: 'TD Build - bin screen', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 8300, total: 8300, markupPercent: 43, revenue: 11869, notes: '' },
  ]

  // Check if estimate already exists for this project
  const existingEstimates = loadEstimates()
  if (existingEstimates.find(e => e.projectId === projectId && (e.name === 'q1371 Import' || e.name === 'Joubert Residence Import' || e.name === 'Sorrento \u2013 Tony Joubert Import'))) {
    return // Already seeded
  }

  const lineItems: EstimateLineItem[] = rawItems.map(item => ({
    ...item,
    id: generateId(),
    estimateId,
  }))

  const totalRevenue = lineItems.reduce((sum, item) => sum + item.revenue, 0)

  const estimate: Estimate = {
    id: estimateId,
    projectId,
    projectName: 'Sorrento \u2013 Tony Joubert',
    name: 'Sorrento \u2013 Tony Joubert Import',
    version: 1,
    status: 'draft',
    defaultMarkupFormation: 58,
    defaultMarkupSubcontractor: 48,
    lineItems,
    notes: 'Imported from Buildxact',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  saveEstimate(estimate)

  // Update project contractValue
  const allProjects = loadProjects()
  const projectIndex = allProjects.findIndex(p => p.id === projectId)
  if (projectIndex >= 0) {
    allProjects[projectIndex].contractValue = totalRevenue
    localStorage.setItem('fg_projects', JSON.stringify(allProjects))
  }
}

export function seedQ1362Estimate(): void {
  if (typeof window === 'undefined') return

  // Skip if already seeded
  const existing = loadEstimates().find(e => e.id === 'q1362-est-1')
  if (existing) return

  // Create project or update if placeholder
  const projects = loadProjects()
  const existingQ1362 = projects.find(p => p.id === 'q1362')
  if (!existingQ1362) {
    saveProject({
      id: 'q1362',
      entity: 'formation',
      name: 'Kew \u2013 Glenn Whittenbury',
      address: '17 Uvadale Grove, Kew VIC 3101',
      clientName: 'Glenn Whittenbury & Jenny Hatzis',
      status: 'planning',
      contractValue: 0,
      startDate: new Date().toISOString().split('T')[0],
      plannedCompletion: '',
      foreman: '',
      notes: '',
      createdAt: new Date().toISOString(),
    })
  } else if (existingQ1362.name === 'q1362' || existingQ1362.name === 'Whittenbury & Hatzis Residence' || existingQ1362.clientName === 'q1362 Client') {
    const allProjects = loadProjects()
    const proj = allProjects.find(p => p.id === 'q1362')
    if (proj) {
      proj.name = 'Kew \u2013 Glenn Whittenbury'
      proj.clientName = 'Glenn Whittenbury & Jenny Hatzis'
      proj.address = '17 Uvadale Grove, Kew VIC 3101'
      localStorage.setItem('fg_projects', JSON.stringify(allProjects))
    }
  }

  const lineItems: Omit<EstimateLineItem, 'id' | 'estimateId'>[] = [
    // Preliminaries (was "t")
    { displayOrder: '1.1', category: 'Preliminaries', description: 'Site toilet', type: 'Equipment', crewType: 'Formation', units: 24, uom: 'week', unitCost: 65, total: 1560, markupPercent: 46, revenue: 2280, notes: '' },
    { displayOrder: '1.2', category: 'Preliminaries', description: 'Hazard Co Site induction', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 450, total: 450, markupPercent: 46, revenue: 657, notes: '' },
    { displayOrder: '1.3', category: 'Preliminaries', description: 'Engineering and permits', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 5000, total: 5000, markupPercent: 46, revenue: 7300, notes: '' },
    { displayOrder: '1.4', category: 'Preliminaries', description: 'Project admin, planning & site establishment', type: 'Material', crewType: 'Formation', units: 1, uom: 'each', unitCost: 3500, total: 3500, markupPercent: 46, revenue: 5110, notes: '' },

    // Demolition
    { displayOrder: '2.1', category: 'Demolition', description: 'Machine operator, truck hire & tipping fees', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Day', unitCost: 2500, total: 2500, markupPercent: 56, revenue: 3900, notes: '' },
    { displayOrder: '2.2', category: 'Demolition', description: 'Demolition labour', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: '10lm', unitCost: 150, total: 150, markupPercent: 56, revenue: 234, notes: '' },
    { displayOrder: '2.3', category: 'Demolition', description: 'Existing swimming pool demolition', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 10000, total: 10000, markupPercent: 56, revenue: 15600, notes: 'Need to get a quote from Reverse Pools' },

    // Site preparation
    { displayOrder: '3.1', category: 'Site preparation', description: 'Machine hire', type: 'Equipment', crewType: 'Formation', units: 2, uom: 'Day', unitCost: 350, total: 700, markupPercent: 61, revenue: 1127, notes: '' },
    { displayOrder: '3.2', category: 'Site preparation', description: '8m3 Mixed heavy bin', type: 'Material', crewType: 'Formation', units: 1, uom: 'Ea', unitCost: 1250, total: 1250, markupPercent: 61, revenue: 2012.5, notes: '' },
    { displayOrder: '3.3', category: 'Site preparation', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 56, uom: 'hour', unitCost: 68, total: 3808, markupPercent: 92.5, revenue: 7329.4, notes: '' },
    { displayOrder: '3.4', category: 'Site preparation', description: 'Protection materials for existing property', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 500, total: 500, markupPercent: 61, revenue: 805, notes: '' },

    // Fireplace - Formation
    { displayOrder: '4.1', category: 'Fireplace - Formation', description: 'Block wall reinforcement', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 100, total: 100, markupPercent: 61, revenue: 161, notes: '' },
    { displayOrder: '4.2', category: 'Fireplace - Formation', description: 'Labour - Foundations, block laying & core filling', type: 'Labour', crewType: 'Formation', units: 24, uom: 'Hour', unitCost: 68, total: 1632, markupPercent: 92.5, revenue: 3141.6, notes: '' },
    { displayOrder: '4.3', category: 'Fireplace - Formation', description: 'Besser Block Masonry 390x90x190', type: 'Material', crewType: 'Formation', units: 55, uom: 'Each', unitCost: 4.02, total: 221.1, markupPercent: 61, revenue: 355.97, notes: 'Supply only' },
    { displayOrder: '4.4', category: 'Fireplace - Formation', description: 'Concrete - core fill mix', type: 'Material', crewType: 'Formation', units: 0.5, uom: 'm3', unitCost: 350, total: 175, markupPercent: 61, revenue: 281.75, notes: '' },
    { displayOrder: '4.5', category: 'Fireplace - Formation', description: 'Block laying materials', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 200, total: 200, markupPercent: 61, revenue: 322, notes: '' },
    { displayOrder: '4.6', category: 'Fireplace - Formation', description: 'Render', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 750, total: 750, markupPercent: 61, revenue: 1207.5, notes: '' },
    { displayOrder: '4.7', category: 'Fireplace - Formation', description: 'Foundation thickening under paving slab', type: 'Material', crewType: 'Formation', units: 0.5, uom: 'Allowance', unitCost: 350, total: 175, markupPercent: 61, revenue: 281.75, notes: '' },
    { displayOrder: '4.8', category: 'Fireplace - Formation', description: 'Steel lintel', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 100, total: 100, markupPercent: 61, revenue: 161, notes: '' },

    // Porcelain paving - Formation
    { displayOrder: '5.1', category: 'Porcelain paving - Formation', description: 'Caulking', type: 'Subcontractor', crewType: 'Subcontractor', units: 29, uom: 'lm', unitCost: 12.5, total: 362.5, markupPercent: 61, revenue: 583.62, notes: '' },
    { displayOrder: '5.2', category: 'Porcelain paving - Formation', description: 'Paving supply (~55m2 600x600 Porcelain from Signorini)', type: 'Material', crewType: 'Formation', units: 60, uom: 'm2', unitCost: 60, total: 3600, markupPercent: 61, revenue: 5796, notes: '~55m2 - 600x600 Porcelain from Signorini' },
    { displayOrder: '5.3', category: 'Porcelain paving - Formation', description: 'Paving installation materials', type: 'Material', crewType: 'Formation', units: 60, uom: 'm2', unitCost: 17.18, total: 1030.5, markupPercent: 61, revenue: 1659.1, notes: '' },
    { displayOrder: '5.4', category: 'Porcelain paving - Formation', description: 'Paving slab (concrete base)', type: 'Material', crewType: 'Formation', units: 6, uom: '10m2', unitCost: 425, total: 2550, markupPercent: 61, revenue: 4105.5, notes: '' },
    { displayOrder: '5.5', category: 'Porcelain paving - Formation', description: 'Grouting Labour', type: 'Labour', crewType: 'Formation', units: 16, uom: 'Hour', unitCost: 68, total: 1088, markupPercent: 92.5, revenue: 2094.4, notes: '' },
    { displayOrder: '5.6', category: 'Porcelain paving - Formation', description: 'Paving labour', type: 'Labour', crewType: 'Formation', units: 80, uom: 'Hour', unitCost: 68, total: 5440, markupPercent: 92.5, revenue: 10472, notes: '' },
    { displayOrder: '5.7', category: 'Porcelain paving - Formation', description: 'Concrete labour', type: 'Labour', crewType: 'Formation', units: 64, uom: 'Hour', unitCost: 68, total: 4352, markupPercent: 92.5, revenue: 8377.6, notes: '' },

    // Paving - Subcontractor
    { displayOrder: '6.1', category: 'Paving - Subcontractor', description: 'Concrete pump', type: 'Subcontractor', crewType: 'Subcontractor', units: 2, uom: 'Ea', unitCost: 1200, total: 2400, markupPercent: 51, revenue: 3624, notes: '' },
    { displayOrder: '6.2', category: 'Paving - Subcontractor', description: 'Sealing of in-situ', type: 'Subcontractor', crewType: 'Subcontractor', units: 50, uom: 'm2', unitCost: 25, total: 1250, markupPercent: 51, revenue: 1887.5, notes: '' },

    // Outdoor kitchen
    { displayOrder: '7.1', category: 'Outdoor kitchen', description: 'Outdoor kitchen supply & install', type: 'Material', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 20000, total: 20000, markupPercent: 51, revenue: 30200, notes: '' },

    // Existing decking alteration
    { displayOrder: '8.1', category: 'Existing decking alteration', description: 'Labour - reuse fascia board, cut back to plans', type: 'Labour', crewType: 'Formation', units: 16, uom: 'Hour', unitCost: 68, total: 1088, markupPercent: 92.5, revenue: 2094.4, notes: 'Re use fascia board - cut back to dimensions shown on plans' },

    // Retaining wall - Formation
    { displayOrder: '9.2', category: 'Retaining wall - Formation', description: 'Besser Block Masonry 390x90x190', type: 'Material', crewType: 'Formation', units: 66, uom: 'Each', unitCost: 4.02, total: 265.32, markupPercent: 61, revenue: 427.16, notes: '' },
    { displayOrder: '9.3', category: 'Retaining wall - Formation', description: 'Concrete block wall foundations - 500x500mm', type: 'Material', crewType: 'Formation', units: 6, uom: 'lm', unitCost: 107.95, total: 647.7, markupPercent: 61, revenue: 1042.8, notes: '' },
    { displayOrder: '9.4', category: 'Retaining wall - Formation', description: 'Blockwork installation materials', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 200, total: 200, markupPercent: 61, revenue: 322, notes: 'Block walls against steps up to & behind pool deck' },
    { displayOrder: '9.5', category: 'Retaining wall - Formation', description: 'Concrete - core fill', type: 'Material', crewType: 'Formation', units: 1, uom: 'm3', unitCost: 350, total: 350, markupPercent: 61, revenue: 563.5, notes: '' },
    { displayOrder: '9.6', category: 'Retaining wall - Formation', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 32, uom: 'Hour', unitCost: 68, total: 2176, markupPercent: 92.5, revenue: 4188.8, notes: '' },

    // In-situ concrete - Pool deck and steps
    { displayOrder: '10.1', category: 'In-situ concrete - Pool deck and steps', description: 'Formwork materials', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 2000, total: 2000, markupPercent: 61, revenue: 3220, notes: '' },
    { displayOrder: '10.2', category: 'In-situ concrete - Pool deck and steps', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 6, uom: 'm3', unitCost: 350, total: 2100, markupPercent: 61, revenue: 3381, notes: '' },
    { displayOrder: '10.3', category: 'In-situ concrete - Pool deck and steps', description: 'Steel mesh', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 600, total: 600, markupPercent: 61, revenue: 966, notes: '' },
    { displayOrder: '10.4', category: 'In-situ concrete - Pool deck and steps', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 200, uom: 'hour', unitCost: 68, total: 13600, markupPercent: 92.5, revenue: 26180, notes: '' },

    // Retaining wall - Subcontractor
    { displayOrder: '11.1', category: 'Retaining wall - Subcontractor', description: 'Block laying', type: 'Subcontractor', crewType: 'Subcontractor', units: 75, uom: 'Allowance', unitCost: 15, total: 1125, markupPercent: 51, revenue: 1698.75, notes: '' },
    { displayOrder: '11.2', category: 'Retaining wall - Subcontractor', description: 'Concrete pump (contribution)', type: 'Subcontractor', crewType: 'Subcontractor', units: 0.5, uom: 'Allowance', unitCost: 1200, total: 600, markupPercent: 51, revenue: 906, notes: '' },
    { displayOrder: '11.3', category: 'Retaining wall - Subcontractor', description: 'Allowance', type: 'Subcontractor', crewType: 'Subcontractor', units: 0.5, uom: 'Allowance', unitCost: 250, total: 125, markupPercent: 51, revenue: 188.75, notes: '' },

    // Sleeper retaining wall
    { displayOrder: '12.1', category: 'Sleeper retaining wall', description: 'Steel channels H & C @ 1500', type: 'Material', crewType: 'Formation', units: 1, uom: 'Ea', unitCost: 60, total: 60, markupPercent: 16, revenue: 69.6, notes: '' },
    { displayOrder: '12.3', category: 'Sleeper retaining wall', description: '2400x200x75 treated pine sleepers', type: 'Material', crewType: 'Formation', units: 28, uom: 'Ea', unitCost: 30, total: 840, markupPercent: 61, revenue: 1352.4, notes: '' },
    { displayOrder: '12.4', category: 'Sleeper retaining wall', description: 'Concrete', type: 'Material', crewType: 'Formation', units: 1, uom: 'm3', unitCost: 350, total: 350, markupPercent: 61, revenue: 563.5, notes: '' },
    { displayOrder: '12.5', category: 'Sleeper retaining wall', description: 'Materials', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 250, total: 250, markupPercent: 61, revenue: 402.5, notes: '' },
    { displayOrder: '12.6', category: 'Sleeper retaining wall', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 40, uom: 'Hour', unitCost: 68, total: 2720, markupPercent: 92.5, revenue: 5236, notes: '' },

    // Louvered pergola
    { displayOrder: '13.1', category: 'Louvered pergola', description: 'Shadewell - louver system', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 60000, total: 60000, markupPercent: 48.5, revenue: 89100, notes: '' },
    { displayOrder: '13.2', category: 'Louvered pergola', description: 'Installation (subcontractor)', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 15000, total: 15000, markupPercent: 51, revenue: 22650, notes: '' },
    { displayOrder: '13.3', category: 'Louvered pergola', description: 'Facade cladding', type: 'Subcontractor', crewType: 'Subcontractor', units: 1, uom: 'Allowance', unitCost: 3000, total: 3000, markupPercent: 51, revenue: 4530, notes: '' },

    // Soft Landscaping (was "t")
    { displayOrder: '14.1', category: 'Soft Landscaping', description: 'Bobcat / machine hire', type: 'Subcontractor', crewType: 'Subcontractor', units: 2, uom: 'each', unitCost: 150, total: 300, markupPercent: 46, revenue: 438, notes: '' },
    { displayOrder: '14.2', category: 'Soft Landscaping', description: 'Plant supply (includes delivery)', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 4000, total: 4000, markupPercent: 71, revenue: 6840, notes: '' },
    { displayOrder: '14.3', category: 'Soft Landscaping', description: '3 way soil blend', type: 'Material', crewType: 'Formation', units: 8, uom: 'm3', unitCost: 125, total: 1000, markupPercent: 61, revenue: 1610, notes: '' },
    { displayOrder: '14.4', category: 'Soft Landscaping', description: 'Buffalo lawn', type: 'Material', crewType: 'Formation', units: 68.39, uom: 'm2', unitCost: 18, total: 1231.02, markupPercent: 61, revenue: 1981.94, notes: '' },
    { displayOrder: '14.5', category: 'Soft Landscaping', description: 'Turf sand', type: 'Material', crewType: 'Formation', units: 6, uom: 'm3', unitCost: 125, total: 750, markupPercent: 61, revenue: 1207.5, notes: '' },
    { displayOrder: '14.6', category: 'Soft Landscaping', description: 'Sure crop mulch', type: 'Material', crewType: 'Formation', units: 2, uom: 'm3', unitCost: 125, total: 250, markupPercent: 61, revenue: 402.5, notes: '' },
    { displayOrder: '14.7', category: 'Soft Landscaping', description: 'Shapescaper steel edging 100x1.6mm', type: 'Material', crewType: 'Formation', units: 38.78, uom: 'lm', unitCost: 40, total: 1551.2, markupPercent: 61, revenue: 2497.43, notes: '' },
    { displayOrder: '14.8', category: 'Soft Landscaping', description: 'Fertilisers & seasol', type: 'Material', crewType: 'Formation', units: 1, uom: 'Ea', unitCost: 75, total: 75, markupPercent: 61, revenue: 120.75, notes: '' },
    { displayOrder: '14.9', category: 'Soft Landscaping', description: 'Machine hire', type: 'Equipment', crewType: 'Formation', units: 1, uom: 'Day', unitCost: 350, total: 350, markupPercent: 61, revenue: 563.5, notes: '' },
    { displayOrder: '14.10', category: 'Soft Landscaping', description: 'Edging labour', type: 'Labour', crewType: 'Formation', units: 16, uom: 'hour', unitCost: 68, total: 1088, markupPercent: 92, revenue: 2089.0, notes: '' },
    { displayOrder: '14.11', category: 'Soft Landscaping', description: 'Garden bed preparation labour', type: 'Labour', crewType: 'Formation', units: 32, uom: 'Hour', unitCost: 68, total: 2176, markupPercent: 92.5, revenue: 4188.8, notes: '' },
    { displayOrder: '14.12', category: 'Soft Landscaping', description: 'Labour - Planting', type: 'Labour', crewType: 'Formation', units: 40, uom: 'Hour', unitCost: 68, total: 2720, markupPercent: 92.5, revenue: 5236, notes: '' },
    { displayOrder: '14.13', category: 'Soft Landscaping', description: 'Labour - Mulch/Clean', type: 'Labour', crewType: 'Formation', units: 32, uom: 'Hour', unitCost: 68, total: 2176, markupPercent: 116, revenue: 4701.16, notes: '' },
    { displayOrder: '14.14', category: 'Soft Landscaping', description: 'Labour - Turf prep and lay', type: 'Labour', crewType: 'Formation', units: 48, uom: 'Hour', unitCost: 68, total: 3264, markupPercent: 92.5, revenue: 6283.2, notes: '' },

    // Lighting
    { displayOrder: '15.1', category: 'Lighting', description: 'Zeron single down lights', type: 'Material', crewType: 'Formation', units: 7, uom: 'each', unitCost: 135, total: 945, markupPercent: 61, revenue: 1521.45, notes: '' },
    { displayOrder: '15.2', category: 'Lighting', description: 'Accent lights', type: 'Material', crewType: 'Formation', units: 24, uom: 'ea', unitCost: 130, total: 3120, markupPercent: 61, revenue: 5023.2, notes: 'Assumptions made for qty' },
    { displayOrder: '15.3', category: 'Lighting', description: 'LED strip', type: 'Material', crewType: 'Formation', units: 13.8, uom: 'lm', unitCost: 60, total: 828, markupPercent: 61, revenue: 1333.08, notes: '' },
    { displayOrder: '15.4', category: 'Lighting', description: '4mm Cable', type: 'Material', crewType: 'Formation', units: 2, uom: 'Roll', unitCost: 200, total: 400, markupPercent: 61, revenue: 644, notes: '' },
    { displayOrder: '15.5', category: 'Lighting', description: 'Heat shrinks', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 150, total: 150, markupPercent: 61, revenue: 241.5, notes: '' },
    { displayOrder: '15.6', category: 'Lighting', description: 'Drivers', type: 'Material', crewType: 'Formation', units: 3, uom: 'each', unitCost: 175, total: 525, markupPercent: 61, revenue: 845.25, notes: '' },
    { displayOrder: '15.7', category: 'Lighting', description: 'Zeron mini rigid mounting channel', type: 'Material', crewType: 'Formation', units: 12, uom: 'lm', unitCost: 5, total: 60, markupPercent: 61, revenue: 96.6, notes: '' },
    { displayOrder: '15.8', category: 'Lighting', description: 'Grey corrugated conduit 20mm x 10m roll', type: 'Material', crewType: 'Formation', units: 5, uom: 'Roll', unitCost: 24, total: 120, markupPercent: 61, revenue: 193.2, notes: '' },
    { displayOrder: '15.9', category: 'Lighting', description: '20mm flexible conduit junction box', type: 'Material', crewType: 'Formation', units: 10, uom: 'each', unitCost: 5, total: 50, markupPercent: 61, revenue: 80.5, notes: '' },
    { displayOrder: '15.10', category: 'Lighting', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 40, uom: 'hour', unitCost: 68, total: 2720, markupPercent: 92.5, revenue: 5236, notes: '' },

    // Irrigation
    { displayOrder: '16.1', category: 'Irrigation', description: 'Irrigation system', type: 'Material', crewType: 'Formation', units: 1, uom: 'Allowance', unitCost: 1500, total: 1500, markupPercent: 61, revenue: 2415, notes: '' },
    { displayOrder: '16.2', category: 'Irrigation', description: 'Labour', type: 'Labour', crewType: 'Formation', units: 40, uom: 'hour', unitCost: 68, total: 2720, markupPercent: 92.5, revenue: 5236, notes: '' },

    // Pool barrier
    { displayOrder: '17.1', category: 'Pool barrier', description: 'Glass barrier', type: 'Material', crewType: 'Subcontractor', units: 17.6, uom: 'lm', unitCost: 550, total: 9680, markupPercent: 51, revenue: 14616.8, notes: '' },
  ]

  const items: EstimateLineItem[] = lineItems.map((item, i) => ({
    ...item,
    id: `q1362-item-${i}`,
    estimateId: 'q1362-est-1',
  }))

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)

  // Update project contract value
  const allProjects = loadProjects()
  const projIdx = allProjects.findIndex(p => p.id === 'q1362')
  if (projIdx >= 0) {
    allProjects[projIdx].contractValue = Math.round(totalRevenue / 1000) * 1000
    localStorage.setItem('fg_projects', JSON.stringify(allProjects))
  }

  const estimate: Estimate = {
    id: 'q1362-est-1',
    projectId: 'q1362',
    projectName: 'Kew \u2013 Glenn Whittenbury',
    name: 'Kew \u2013 Glenn Whittenbury Import',
    version: 1,
    status: 'draft',
    defaultMarkupFormation: 61,
    defaultMarkupSubcontractor: 51,
    lineItems: items,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  saveEstimate(estimate)
}

export function seedQ1356Estimate(): void {
  if (typeof window === 'undefined') return
  if (loadEstimates().find(e => e.id === 'q1356-est-1')) return
  const projects = loadProjects()
  const existingQ1356 = projects.find(p => p.id === 'q1356')
  if (!existingQ1356) {
    saveProject({ id:'q1356', entity:'formation' as const, name:'Richmond \u2013 James Blaufelder', address:'3 Kent St, Richmond VIC 3121', clientName:'James and Haley Blaufelder', status:'planning' as const, contractValue:0, startDate:new Date().toISOString().split('T')[0], plannedCompletion:'', foreman:'', notes:'', createdAt:new Date().toISOString() })
  } else if (existingQ1356.name === 'q1356' || existingQ1356.name === 'Blaufelder Residence') {
    const allProjects = loadProjects()
    const proj = allProjects.find(p => p.id === 'q1356')
    if (proj) {
      proj.name = 'Richmond \u2013 James Blaufelder'
      proj.clientName = 'James and Haley Blaufelder'
      proj.address = '3 Kent St, Richmond VIC 3121'
      localStorage.setItem('fg_projects', JSON.stringify(allProjects))
    }
  }
  const items: EstimateLineItem[] = [
    { id:'q1356-1', estimateId:'q1356-est-1', displayOrder:'1.1', category:'Preliminaries', description:'Site toilet', type:'Equipment' as const, crewType:'Formation' as const, units:5, uom:'week', unitCost:65, total:325, markupPercent:46, revenue:474.5, notes:'' },
    { id:'q1356-2', estimateId:'q1356-est-1', displayOrder:'1.2', category:'Preliminaries', description:'Hazard Co Site induction', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:450, total:450, markupPercent:46, revenue:657, notes:'' },
    { id:'q1356-3', estimateId:'q1356-est-1', displayOrder:'2.2', category:'Paving - Signorino', description:'Supply of paving', type:'Material' as const, crewType:'Formation' as const, units:22, uom:'m2', unitCost:50, total:1100, markupPercent:61, revenue:1771, notes:'' },
    { id:'q1356-4', estimateId:'q1356-est-1', displayOrder:'2.3', category:'Paving - Signorino', description:'Paving delivery', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Ea', unitCost:300, total:300, markupPercent:46, revenue:438, notes:'' },
    { id:'q1356-5', estimateId:'q1356-est-1', displayOrder:'2.4', category:'Paving - Signorino', description:'Paving slab (incl in-situ steps)', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'10m2', unitCost:425, total:850, markupPercent:61, revenue:1368.5, notes:'Includes in situ steps plinth' },
    { id:'q1356-6', estimateId:'q1356-est-1', displayOrder:'2.5', category:'Paving - Signorino', description:'Paving installation materials', type:'Material' as const, crewType:'Formation' as const, units:20, uom:'m2', unitCost:23.8, total:476, markupPercent:61, revenue:766.36, notes:'' },
    { id:'q1356-7', estimateId:'q1356-est-1', displayOrder:'2.6', category:'Paving - Signorino', description:'Caulking', type:'Material' as const, crewType:'Formation' as const, units:15.22, uom:'lm', unitCost:15, total:228.3, markupPercent:46, revenue:333.32, notes:'' },
    { id:'q1356-8', estimateId:'q1356-est-1', displayOrder:'2.7', category:'Paving - Signorino', description:'150mm SS floor waste grating', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'each', unitCost:200, total:200, markupPercent:61, revenue:322, notes:'' },
    { id:'q1356-9', estimateId:'q1356-est-1', displayOrder:'2.8', category:'Paving - Signorino', description:'HIDE access lid 506x506', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'each', unitCost:600, total:600, markupPercent:46, revenue:876, notes:'' },
    { id:'q1356-10', estimateId:'q1356-est-1', displayOrder:'2.9', category:'Paving - Signorino', description:'Slab prep labour', type:'Labour' as const, crewType:'Formation' as const, units:32, uom:'Hour', unitCost:68, total:2176, markupPercent:92.5, revenue:4188.8, notes:'' },
    { id:'q1356-11', estimateId:'q1356-est-1', displayOrder:'2.10', category:'Paving - Signorino', description:'Paving labour', type:'Labour' as const, crewType:'Formation' as const, units:40, uom:'Hour', unitCost:68, total:2720, markupPercent:92.5, revenue:5236, notes:'' },
    { id:'q1356-12', estimateId:'q1356-est-1', displayOrder:'2.11', category:'Paving - Signorino', description:'Grouting & caulking labour', type:'Labour' as const, crewType:'Formation' as const, units:8, uom:'Hour', unitCost:68, total:544, markupPercent:92.5, revenue:1047.2, notes:'' },
    { id:'q1356-13', estimateId:'q1356-est-1', displayOrder:'2.12', category:'Paving - Signorino', description:'Drainage labour', type:'Labour' as const, crewType:'Formation' as const, units:3, uom:'Hour', unitCost:55, total:165, markupPercent:90, revenue:313.5, notes:'' },
    { id:'q1356-14', estimateId:'q1356-est-1', displayOrder:'2.13', category:'Paving - Signorino', description:'Step tread manufacturing', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:4, uom:'Ea', unitCost:125, total:500, markupPercent:61, revenue:805, notes:'' },
    { id:'q1356-15', estimateId:'q1356-est-1', displayOrder:'2.14', category:'Paving - Signorino', description:'Waterproofing allowance', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:350, total:350, markupPercent:61, revenue:563.5, notes:'' },
    { id:'q1356-16', estimateId:'q1356-est-1', displayOrder:'2.15', category:'Paving - Signorino', description:'Misc plumbing materials', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:200, total:200, markupPercent:61, revenue:322, notes:'' },
    { id:'q1356-17', estimateId:'q1356-est-1', displayOrder:'3.1', category:'In-situ concrete - BBQ bench', description:'Formwork materials', type:'Material' as const, crewType:'Formation' as const, units:0.75, uom:'Allowance', unitCost:1000, total:750, markupPercent:61, revenue:1207.5, notes:'' },
    { id:'q1356-18', estimateId:'q1356-est-1', displayOrder:'3.2', category:'In-situ concrete - BBQ bench', description:'Concrete - Footing', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:300, total:300, markupPercent:61, revenue:483, notes:'' },
    { id:'q1356-19', estimateId:'q1356-est-1', displayOrder:'3.3', category:'In-situ concrete - BBQ bench', description:'Concrete - bench', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:350, total:350, markupPercent:61, revenue:563.5, notes:'' },
    { id:'q1356-20', estimateId:'q1356-est-1', displayOrder:'3.4', category:'In-situ concrete - BBQ bench', description:'Steel mesh', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'Allowance', unitCost:150, total:300, markupPercent:61, revenue:483, notes:'' },
    { id:'q1356-21', estimateId:'q1356-est-1', displayOrder:'3.5', category:'In-situ concrete - BBQ bench', description:'Labour - Footing', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'Hour', unitCost:55, total:880, markupPercent:116, revenue:1900.8, notes:'' },
    { id:'q1356-22', estimateId:'q1356-est-1', displayOrder:'3.6', category:'In-situ concrete - BBQ bench', description:'Labour - Benchtop', type:'Labour' as const, crewType:'Formation' as const, units:80, uom:'Hour', unitCost:55, total:4400, markupPercent:116, revenue:9504, notes:'' },
    { id:'q1356-23', estimateId:'q1356-est-1', displayOrder:'3.7', category:'In-situ concrete - BBQ bench', description:'Sealing', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:2, uom:'Allowance', unitCost:300, total:600, markupPercent:46, revenue:876, notes:'' },
    { id:'q1356-24', estimateId:'q1356-est-1', displayOrder:'4.1', category:'Soft Landscaping', description:'Plant supply', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:2000, total:2000, markupPercent:71, revenue:3420, notes:'' },
    { id:'q1356-25', estimateId:'q1356-est-1', displayOrder:'4.2', category:'Soft Landscaping', description:'Machine hire', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:2, uom:'each', unitCost:150, total:300, markupPercent:46, revenue:438, notes:'' },
    { id:'q1356-26', estimateId:'q1356-est-1', displayOrder:'4.3', category:'Soft Landscaping', description:'3 way soil blend', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'m3', unitCost:100, total:200, markupPercent:61, revenue:322, notes:'' },
    { id:'q1356-27', estimateId:'q1356-est-1', displayOrder:'4.4', category:'Soft Landscaping', description:'Labour - Planting', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'Hour', unitCost:55, total:880, markupPercent:116, revenue:1900.8, notes:'' },
    { id:'q1356-28', estimateId:'q1356-est-1', displayOrder:'4.5', category:'Soft Landscaping', description:'Garden bed labour', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'Hour', unitCost:55, total:880, markupPercent:116, revenue:1900.8, notes:'' },
    { id:'q1356-29', estimateId:'q1356-est-1', displayOrder:'4.6', category:'Soft Landscaping', description:'Sure crop mulch', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:125, total:125, markupPercent:61, revenue:201.25, notes:'' },
    { id:'q1356-30', estimateId:'q1356-est-1', displayOrder:'4.7', category:'Soft Landscaping', description:'Labour - Mulch/Clean', type:'Labour' as const, crewType:'Formation' as const, units:8, uom:'Hour', unitCost:55, total:440, markupPercent:116, revenue:950.4, notes:'' },
    { id:'q1356-31', estimateId:'q1356-est-1', displayOrder:'4.8', category:'Soft Landscaping', description:'Fertilisers & seasol', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Ea', unitCost:75, total:75, markupPercent:61, revenue:120.75, notes:'' },
    { id:'q1356-32', estimateId:'q1356-est-1', displayOrder:'4.9', category:'Soft Landscaping', description:'Shapescaper galvabond steel edging', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'each', unitCost:110, total:110, markupPercent:61, revenue:177.1, notes:'' },
    { id:'q1356-33', estimateId:'q1356-est-1', displayOrder:'4.10', category:'Soft Landscaping', description:'Dulux etch primer', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'each', unitCost:125, total:125, markupPercent:61, revenue:201.25, notes:'Includes allowance for roller kit & painters tape' },
    { id:'q1356-34', estimateId:'q1356-est-1', displayOrder:'4.11', category:'Soft Landscaping', description:'Edging install & painting labour', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'hour', unitCost:52.5, total:840, markupPercent:115, revenue:1806, notes:'' },
    { id:'q1356-35', estimateId:'q1356-est-1', displayOrder:'4.12', category:'Soft Landscaping', description:'Screenings & potting mix', type:'Material' as const, crewType:'Formation' as const, units:2.6, uom:'m3', unitCost:125, total:325, markupPercent:61, revenue:523.25, notes:'' },
    { id:'q1356-36', estimateId:'q1356-est-1', displayOrder:'4.13', category:'Soft Landscaping', description:'Buffalo turf', type:'Material' as const, crewType:'Formation' as const, units:6, uom:'m2', unitCost:25, total:150, markupPercent:61, revenue:241.5, notes:'' },
    { id:'q1356-37', estimateId:'q1356-est-1', displayOrder:'5.1', category:'Lighting', description:'Accent lights', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'ea', unitCost:130, total:260, markupPercent:61, revenue:418.6, notes:'' },
    { id:'q1356-38', estimateId:'q1356-est-1', displayOrder:'5.2', category:'Lighting', description:'LED strip', type:'Material' as const, crewType:'Formation' as const, units:4, uom:'lm', unitCost:60, total:240, markupPercent:61, revenue:386.4, notes:'' },
    { id:'q1356-39', estimateId:'q1356-est-1', displayOrder:'5.3', category:'Lighting', description:'ZERON MIN Up/Down wall light - black', type:'Material' as const, crewType:'Formation' as const, units:8, uom:'ea', unitCost:150, total:1200, markupPercent:61, revenue:1932, notes:'' },
    { id:'q1356-40', estimateId:'q1356-est-1', displayOrder:'5.4', category:'Lighting', description:'ONYX Single spotlight', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'ea', unitCost:120, total:120, markupPercent:61, revenue:193.2, notes:'' },
    { id:'q1356-41', estimateId:'q1356-est-1', displayOrder:'5.5', category:'Lighting', description:'4mm Cable', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Roll', unitCost:200, total:200, markupPercent:61, revenue:322, notes:'' },
    { id:'q1356-42', estimateId:'q1356-est-1', displayOrder:'5.6', category:'Lighting', description:'Heat shrinks', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:50, total:50, markupPercent:61, revenue:80.5, notes:'' },
    { id:'q1356-43', estimateId:'q1356-est-1', displayOrder:'5.7', category:'Lighting', description:'Drivers', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'each', unitCost:175, total:350, markupPercent:61, revenue:563.5, notes:'' },
    { id:'q1356-44', estimateId:'q1356-est-1', displayOrder:'5.8', category:'Lighting', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:24, uom:'hour', unitCost:55, total:1320, markupPercent:116, revenue:2851.2, notes:'' },
    { id:'q1356-45', estimateId:'q1356-est-1', displayOrder:'6.1', category:'Irrigation', description:'Irrigation system', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:1100, total:1100, markupPercent:61, revenue:1771, notes:'' },
    { id:'q1356-46', estimateId:'q1356-est-1', displayOrder:'6.2', category:'Irrigation', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'hour', unitCost:55, total:880, markupPercent:116, revenue:1900.8, notes:'' },
    { id:'q1356-47', estimateId:'q1356-est-1', displayOrder:'7.2', category:'Trellis / Screen', description:'150x50x3mm Aluminium RHS - Satin black', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'6.4m length', unitCost:690, total:1380, markupPercent:61, revenue:2221.8, notes:'' },
    { id:'q1356-48', estimateId:'q1356-est-1', displayOrder:'7.3', category:'Trellis / Screen', description:'Fixtures & fittings', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:200, total:200, markupPercent:61, revenue:322, notes:'' },
    { id:'q1356-49', estimateId:'q1356-est-1', displayOrder:'7.4', category:'Trellis / Screen', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'Hour', unitCost:68, total:1088, markupPercent:92.5, revenue:2094.4, notes:'' },
    { id:'q1356-50', estimateId:'q1356-est-1', displayOrder:'8.1', category:'Block wall for planter', description:'Concrete block wall foundations', type:'Material' as const, crewType:'Formation' as const, units:7.84, uom:'lm', unitCost:107.95, total:846.33, markupPercent:16, revenue:981.74, notes:'' },
    { id:'q1356-51', estimateId:'q1356-est-1', displayOrder:'8.2', category:'Block wall for planter', description:'390x190x190 besser blocks', type:'Material' as const, crewType:'Formation' as const, units:100, uom:'Ea', unitCost:4.5, total:450, markupPercent:61, revenue:724.5, notes:'' },
    { id:'q1356-52', estimateId:'q1356-est-1', displayOrder:'8.3', category:'Block wall for planter', description:'Concrete - core fill', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:350, total:350, markupPercent:61, revenue:563.5, notes:'' },
    { id:'q1356-53', estimateId:'q1356-est-1', displayOrder:'8.4', category:'Block wall for planter', description:'Steel reinforcement', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:61, revenue:241.5, notes:'' },
    { id:'q1356-54', estimateId:'q1356-est-1', displayOrder:'8.5', category:'Block wall for planter', description:'Waterproofing materials', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:500, total:500, markupPercent:61, revenue:805, notes:'' },
    { id:'q1356-55', estimateId:'q1356-est-1', displayOrder:'8.6', category:'Block wall for planter', description:'Bricklayer', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:1000, total:1000, markupPercent:51, revenue:1510, notes:'' },
    { id:'q1356-56', estimateId:'q1356-est-1', displayOrder:'8.7', category:'Block wall for planter', description:'Render', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:1200, total:1200, markupPercent:51, revenue:1812, notes:'' },
    { id:'q1356-57', estimateId:'q1356-est-1', displayOrder:'8.8', category:'Block wall for planter', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:56, uom:'Hour', unitCost:68, total:3808, markupPercent:92.5, revenue:7330.4, notes:'' },
    { id:'q1356-58', estimateId:'q1356-est-1', displayOrder:'9.1', category:'Post & mesh screen (VM)', description:'90x90 dressed cypress posts', type:'Material' as const, crewType:'Formation' as const, units:8, uom:'Ea', unitCost:90, total:720, markupPercent:61, revenue:1159.2, notes:'' },
    { id:'q1356-59', estimateId:'q1356-est-1', displayOrder:'9.2', category:'Post & mesh screen (VM)', description:'F72 reinforcement mesh', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'sheet', unitCost:150, total:300, markupPercent:61, revenue:483, notes:'' },
    { id:'q1356-60', estimateId:'q1356-est-1', displayOrder:'9.3', category:'Post & mesh screen (VM)', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:350, total:350, markupPercent:61, revenue:563.5, notes:'' },
    { id:'q1356-61', estimateId:'q1356-est-1', displayOrder:'9.4', category:'Post & mesh screen (VM)', description:'Paint', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:61, revenue:241.5, notes:'' },
    { id:'q1356-62', estimateId:'q1356-est-1', displayOrder:'9.5', category:'Post & mesh screen (VM)', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:40, uom:'Hour', unitCost:68, total:2720, markupPercent:92.5, revenue:5236, notes:'' },
    { id:'q1356-63', estimateId:'q1356-est-1', displayOrder:'11.1', category:'Sleeper wall', description:'Sleepers', type:'Material' as const, crewType:'Formation' as const, units:8, uom:'ea', unitCost:30, total:240, markupPercent:61, revenue:386.4, notes:'' },
    { id:'q1356-64', estimateId:'q1356-est-1', displayOrder:'11.2', category:'Sleeper wall', description:'Steel channels', type:'Material' as const, crewType:'Formation' as const, units:4, uom:'ea', unitCost:70, total:280, markupPercent:61, revenue:450.8, notes:'' },
    { id:'q1356-65', estimateId:'q1356-est-1', displayOrder:'11.3', category:'Sleeper wall', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:0.3, uom:'m3', unitCost:300, total:90, markupPercent:61, revenue:144.9, notes:'' },
    { id:'q1356-66', estimateId:'q1356-est-1', displayOrder:'11.4', category:'Sleeper wall', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:8, uom:'hour', unitCost:68, total:544, markupPercent:92.5, revenue:1047.2, notes:'' },
  ]
  const totalRevenue = items.reduce((s,i) => s+i.revenue, 0)
  const allProjects = loadProjects()
  const pi = allProjects.findIndex(p => p.id === 'q1356')
  if (pi >= 0) { allProjects[pi].contractValue = Math.round(totalRevenue/1000)*1000; localStorage.setItem('fg_projects', JSON.stringify(allProjects)) }
  saveEstimate({ id:'q1356-est-1', projectId:'q1356', projectName:'Richmond \u2013 James Blaufelder', name:'Richmond \u2013 James Blaufelder Import', version:1, status:'draft', defaultMarkupFormation:61, defaultMarkupSubcontractor:51, lineItems:items, notes:'', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() })
}

export function seedQ1369Estimate(): void {
  if (typeof window === 'undefined') return
  if (loadEstimates().find(e => e.id === 'q1369-est-1')) return
  const projects = loadProjects()
  const existingQ1369 = projects.find(p => p.id === 'q1369')
  if (!existingQ1369) {
    saveProject({ id:'q1369', entity:'formation' as const, name:'Kew \u2013 Dedic', address:'22 Edward St, Kew VIC 3101', clientName:'Dedic Residence', status:'planning' as const, contractValue:0, startDate:new Date().toISOString().split('T')[0], plannedCompletion:'', foreman:'', notes:'', createdAt:new Date().toISOString() })
  } else if (existingQ1369.name === 'q1369' || existingQ1369.name === 'Dedic Residence') {
    const allProjects = loadProjects()
    const proj = allProjects.find(p => p.id === 'q1369')
    if (proj) {
      proj.name = 'Kew \u2013 Dedic'
      proj.clientName = 'Dedic Residence'
      proj.address = '22 Edward St, Kew VIC 3101'
      localStorage.setItem('fg_projects', JSON.stringify(allProjects))
    }
  }
  const items: EstimateLineItem[] = [
    { id:'q1369-1', estimateId:'q1369-est-1', displayOrder:'1.4', category:'Paving - Pod system (rear terrace)', description:'Supply paving - Signorino Villastone 600x600x20', type:'Material' as const, crewType:'Formation' as const, units:155, uom:'m2', unitCost:70, total:10850, markupPercent:56, revenue:16926, notes:'Rear terrace & pavilion, ~3 pedestals/m2' },
    { id:'q1369-2', estimateId:'q1369-est-1', displayOrder:'1.5', category:'Paving - Pod system (rear terrace)', description:'KEKSIA NM3 Adjustable pedestals 60-100mm with rubber base', type:'Material' as const, crewType:'Formation' as const, units:441, uom:'each', unitCost:10.5, total:4630.5, markupPercent:61, revenue:7455.1, notes:'' },
    { id:'q1369-3', estimateId:'q1369-est-1', displayOrder:'1.6', category:'Paving - Pod system (rear terrace)', description:'Edge trim', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'box', unitCost:500, total:500, markupPercent:61, revenue:805, notes:'' },
    { id:'q1369-4', estimateId:'q1369-est-1', displayOrder:'1.7', category:'Paving - Pod system (rear terrace)', description:'Perimeter spacers', type:'Material' as const, crewType:'Formation' as const, units:50, uom:'each', unitCost:4, total:200, markupPercent:61, revenue:322, notes:'' },
    { id:'q1369-5', estimateId:'q1369-est-1', displayOrder:'1.8', category:'Paving - Pod system (rear terrace)', description:'Tile risers', type:'Material' as const, crewType:'Formation' as const, units:42, uom:'pair', unitCost:21, total:882, markupPercent:61, revenue:1420.02, notes:'' },
    { id:'q1369-6', estimateId:'q1369-est-1', displayOrder:'1.9', category:'Paving - Pod system (rear terrace)', description:'Labour - Paving install', type:'Labour' as const, crewType:'Formation' as const, units:192, uom:'hour', unitCost:68, total:13056, markupPercent:92.5, revenue:25132.8, notes:'6 x days 3 guys to lay' },
    { id:'q1369-7', estimateId:'q1369-est-1', displayOrder:'1.10', category:'Paving - Pod system (rear terrace)', description:'Cutting - on or offsite', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:100, uom:'Allowance', unitCost:40, total:4000, markupPercent:61, revenue:6440, notes:'' },
    { id:'q1369-8', estimateId:'q1369-est-1', displayOrder:'1.11', category:'Paving - Pod system (rear terrace)', description:'Freight - ECO', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:2, uom:'Allowance', unitCost:250, total:500, markupPercent:61, revenue:805, notes:'' },
    { id:'q1369-9', estimateId:'q1369-est-1', displayOrder:'1.12', category:'Paving - Pod system (rear terrace)', description:'Bin contribution', type:'Material' as const, crewType:'Formation' as const, units:0.5, uom:'each', unitCost:12000, total:6000, markupPercent:61, revenue:9660, notes:'' },
    { id:'q1369-10', estimateId:'q1369-est-1', displayOrder:'2.2', category:'Paving - Mortar & grout (pool zone)', description:'Supply paving - Signorino Villastone 600x600x20', type:'Material' as const, crewType:'Formation' as const, units:66, uom:'m2', unitCost:70, total:4620, markupPercent:56, revenue:7207.2, notes:'Pool zone & sundeck' },
    { id:'q1369-11', estimateId:'q1369-est-1', displayOrder:'2.3', category:'Paving - Mortar & grout (pool zone)', description:'Paving installation materials', type:'Material' as const, crewType:'Formation' as const, units:63, uom:'m2', unitCost:22.33, total:1406.48, markupPercent:61, revenue:2264.43, notes:'' },
    { id:'q1369-12', estimateId:'q1369-est-1', displayOrder:'2.4', category:'Paving - Mortar & grout (pool zone)', description:'Mapei white tile adhesive', type:'Material' as const, crewType:'Formation' as const, units:14, uom:'Bag', unitCost:42, total:588, markupPercent:61, revenue:946.68, notes:'' },
    { id:'q1369-13', estimateId:'q1369-est-1', displayOrder:'2.5', category:'Paving - Mortar & grout (pool zone)', description:'Freight - ECO', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:250, total:250, markupPercent:61, revenue:402.5, notes:'' },
    { id:'q1369-14', estimateId:'q1369-est-1', displayOrder:'2.6', category:'Paving - Mortar & grout (pool zone)', description:'Labour - Installation', type:'Labour' as const, crewType:'Formation' as const, units:80, uom:'Hour', unitCost:68, total:5440, markupPercent:92.5, revenue:10472, notes:'' },
    { id:'q1369-15', estimateId:'q1369-est-1', displayOrder:'2.7', category:'Paving - Mortar & grout (pool zone)', description:'Caulking', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:25, uom:'each', unitCost:25, total:625, markupPercent:61, revenue:1006.25, notes:'' },
    { id:'q1369-16', estimateId:'q1369-est-1', displayOrder:'2.8', category:'Paving - Mortar & grout (pool zone)', description:'Bin contribution', type:'Material' as const, crewType:'Formation' as const, units:0.5, uom:'Ea', unitCost:1200, total:600, markupPercent:61, revenue:966, notes:'' },
    { id:'q1369-17', estimateId:'q1369-est-1', displayOrder:'3.3', category:'Paving - 1st floor balconies', description:'KEKSIA NM2 pedestals 40-70mm with rubber base', type:'Material' as const, crewType:'Formation' as const, units:133, uom:'Ea', unitCost:7.5, total:997.5, markupPercent:61, revenue:1606.98, notes:'' },
    { id:'q1369-18', estimateId:'q1369-est-1', displayOrder:'3.4', category:'Paving - 1st floor balconies', description:'Perimeter spacers', type:'Material' as const, crewType:'Formation' as const, units:60, uom:'Ea', unitCost:3.5, total:210, markupPercent:61, revenue:338.1, notes:'' },
    { id:'q1369-19', estimateId:'q1369-est-1', displayOrder:'3.5', category:'Paving - 1st floor balconies', description:'Supply paving', type:'Material' as const, crewType:'Formation' as const, units:47, uom:'m2', unitCost:70, total:3290, markupPercent:56, revenue:5132.4, notes:'' },
    { id:'q1369-20', estimateId:'q1369-est-1', displayOrder:'3.6', category:'Paving - 1st floor balconies', description:'Labour - Installation', type:'Labour' as const, crewType:'Formation' as const, units:48, uom:'Hour', unitCost:68, total:3264, markupPercent:92.5, revenue:6283.2, notes:'' },
    { id:'q1369-21', estimateId:'q1369-est-1', displayOrder:'3.7', category:'Paving - 1st floor balconies', description:'Labour - Materials management', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'Hour', unitCost:68, total:1088, markupPercent:92.5, revenue:2094.4, notes:'' },
    { id:'q1369-22', estimateId:'q1369-est-1', displayOrder:'3.8', category:'Paving - 1st floor balconies', description:'Cutting', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:40, uom:'each', unitCost:50, total:2000, markupPercent:61, revenue:3220, notes:'' },
    { id:'q1369-23', estimateId:'q1369-est-1', displayOrder:'4.2', category:'Paving - Front & side entrance', description:'Supply paving - Signorino Villastone', type:'Material' as const, crewType:'Formation' as const, units:126.5, uom:'m2', unitCost:70, total:8855, markupPercent:56, revenue:13813.8, notes:'Front entrance, side entrance & front terrace' },
    { id:'q1369-24', estimateId:'q1369-est-1', displayOrder:'4.3', category:'Paving - Front & side entrance', description:'Paving installation materials', type:'Material' as const, crewType:'Formation' as const, units:126, uom:'m2', unitCost:22.33, total:2812.95, markupPercent:61, revenue:4528.85, notes:'' },
    { id:'q1369-25', estimateId:'q1369-est-1', displayOrder:'4.4', category:'Paving - Front & side entrance', description:'Mapei white tile adhesive', type:'Material' as const, crewType:'Formation' as const, units:27, uom:'Bag', unitCost:42, total:1134, markupPercent:61, revenue:1825.74, notes:'' },
    { id:'q1369-26', estimateId:'q1369-est-1', displayOrder:'4.5', category:'Paving - Front & side entrance', description:'Freight - ECO', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:250, total:250, markupPercent:61, revenue:402.5, notes:'' },
    { id:'q1369-27', estimateId:'q1369-est-1', displayOrder:'4.6', category:'Paving - Front & side entrance', description:'Bin contribution', type:'Material' as const, crewType:'Formation' as const, units:0.5, uom:'Ea', unitCost:1200, total:600, markupPercent:61, revenue:966, notes:'' },
    { id:'q1369-28', estimateId:'q1369-est-1', displayOrder:'4.7', category:'Paving - Front & side entrance', description:'Labour - Lay', type:'Labour' as const, crewType:'Formation' as const, units:120, uom:'Hour', unitCost:68, total:8160, markupPercent:92.5, revenue:15708, notes:'' },
    { id:'q1369-29', estimateId:'q1369-est-1', displayOrder:'4.8', category:'Paving - Front & side entrance', description:'Labour - Grout', type:'Labour' as const, crewType:'Formation' as const, units:24, uom:'Hour', unitCost:68, total:1632, markupPercent:92.5, revenue:3141.6, notes:'' },
    { id:'q1369-30', estimateId:'q1369-est-1', displayOrder:'4.9', category:'Paving - Front & side entrance', description:'Caulking', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:25, uom:'each', unitCost:25, total:625, markupPercent:61, revenue:1006.25, notes:'' },
    { id:'q1369-31', estimateId:'q1369-est-1', displayOrder:'5.2', category:'Paving - Front courtyard', description:'Crushed rock base', type:'Material' as const, crewType:'Formation' as const, units:6, uom:'m3', unitCost:125, total:750, markupPercent:61, revenue:1207.5, notes:'Diamond pattern, 100mm spaces' },
    { id:'q1369-32', estimateId:'q1369-est-1', displayOrder:'5.3', category:'Paving - Front courtyard', description:'Paving installation materials', type:'Material' as const, crewType:'Formation' as const, units:50, uom:'m2', unitCost:22.33, total:1116.25, markupPercent:61, revenue:1797.16, notes:'' },
    { id:'q1369-33', estimateId:'q1369-est-1', displayOrder:'5.4', category:'Paving - Front courtyard', description:'Supply paving - Signorino Villastone', type:'Material' as const, crewType:'Formation' as const, units:50, uom:'m2', unitCost:70, total:3500, markupPercent:56, revenue:5460, notes:'' },
    { id:'q1369-34', estimateId:'q1369-est-1', displayOrder:'5.5', category:'Paving - Front courtyard', description:'Cutting', type:'Material' as const, crewType:'Formation' as const, units:40, uom:'each', unitCost:25, total:1000, markupPercent:61, revenue:1610, notes:'' },
    { id:'q1369-35', estimateId:'q1369-est-1', displayOrder:'5.6', category:'Paving - Front courtyard', description:'Labour - Preparation', type:'Labour' as const, crewType:'Formation' as const, units:24, uom:'hour', unitCost:68, total:1632, markupPercent:92.5, revenue:3141.6, notes:'' },
    { id:'q1369-36', estimateId:'q1369-est-1', displayOrder:'5.7', category:'Paving - Front courtyard', description:'Labour - Install', type:'Labour' as const, crewType:'Formation' as const, units:56, uom:'hour', unitCost:68, total:3808, markupPercent:56, revenue:5940.48, notes:'' },
    { id:'q1369-37', estimateId:'q1369-est-1', displayOrder:'5.8', category:'Paving - Front courtyard', description:'Labour - Rock removal', type:'Labour' as const, crewType:'Formation' as const, units:8, uom:'hour', unitCost:68, total:544, markupPercent:92.5, revenue:1047.2, notes:'' },
    { id:'q1369-38', estimateId:'q1369-est-1', displayOrder:'6.2', category:'Paving - Internal courtyard', description:'Paving installation materials', type:'Material' as const, crewType:'Formation' as const, units:20, uom:'m2', unitCost:22.33, total:446.5, markupPercent:61, revenue:719.07, notes:'' },
    { id:'q1369-39', estimateId:'q1369-est-1', displayOrder:'6.3', category:'Paving - Internal courtyard', description:'Supply paving', type:'Material' as const, crewType:'Formation' as const, units:22, uom:'m2', unitCost:70, total:1540, markupPercent:56, revenue:2402.4, notes:'' },
    { id:'q1369-40', estimateId:'q1369-est-1', displayOrder:'6.4', category:'Paving - Internal courtyard', description:'Cutting', type:'Material' as const, crewType:'Formation' as const, units:10, uom:'each', unitCost:25, total:250, markupPercent:61, revenue:402.5, notes:'' },
    { id:'q1369-41', estimateId:'q1369-est-1', displayOrder:'6.5', category:'Paving - Internal courtyard', description:'Labour - Install', type:'Labour' as const, crewType:'Formation' as const, units:24, uom:'hour', unitCost:68, total:1632, markupPercent:62.5, revenue:2652, notes:'' },
    { id:'q1369-42', estimateId:'q1369-est-1', displayOrder:'6.6', category:'Paving - Internal courtyard', description:'Labour - Grout', type:'Labour' as const, crewType:'Formation' as const, units:8, uom:'hour', unitCost:68, total:544, markupPercent:92.5, revenue:1047.2, notes:'' },
    { id:'q1369-43', estimateId:'q1369-est-1', displayOrder:'7.2', category:'Paving - Driveway', description:'Supply paving - Yarrabee Chalazia quartz', type:'Material' as const, crewType:'Formation' as const, units:69, uom:'m2', unitCost:140, total:9660, markupPercent:56, revenue:15069.6, notes:'Yarrabee Chalazia quartz filetti or cobblestones' },
    { id:'q1369-44', estimateId:'q1369-est-1', displayOrder:'7.3', category:'Paving - Driveway', description:'Paving installation materials', type:'Material' as const, crewType:'Formation' as const, units:70, uom:'m2', unitCost:20.55, total:1438.5, markupPercent:61, revenue:2315.99, notes:'' },
    { id:'q1369-45', estimateId:'q1369-est-1', displayOrder:'7.4', category:'Paving - Driveway', description:'Labour - Lay', type:'Labour' as const, crewType:'Formation' as const, units:192, uom:'Hour', unitCost:68, total:13056, markupPercent:92.5, revenue:25132.8, notes:'' },
    { id:'q1369-46', estimateId:'q1369-est-1', displayOrder:'7.5', category:'Paving - Driveway', description:'Labour - Grout', type:'Labour' as const, crewType:'Formation' as const, units:32, uom:'Hour', unitCost:68, total:2176, markupPercent:92.5, revenue:4188.8, notes:'' },
    { id:'q1369-47', estimateId:'q1369-est-1', displayOrder:'7.6', category:'Paving - Driveway', description:'Freight', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Ea', unitCost:300, total:300, markupPercent:61, revenue:483, notes:'' },
    { id:'q1369-48', estimateId:'q1369-est-1', displayOrder:'7.7', category:'Paving - Driveway', description:'Caulking', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:41.29, uom:'lm', unitCost:15, total:619.35, markupPercent:51, revenue:935.22, notes:'' },
    { id:'q1369-49', estimateId:'q1369-est-1', displayOrder:'8.1', category:'Planter boxes - front entrance', description:'Custom powdercoated aluminium planters', type:'Material' as const, crewType:'Subcontractor' as const, units:2, uom:'Allowance', unitCost:2500, total:5000, markupPercent:61, revenue:8050, notes:'' },
    { id:'q1369-50', estimateId:'q1369-est-1', displayOrder:'9.3', category:'Soft Landscaping', description:'Supply - Plants', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:50000, total:50000, markupPercent:66, revenue:83000, notes:'' },
    { id:'q1369-51', estimateId:'q1369-est-1', displayOrder:'9.4', category:'Soft Landscaping', description:'Supply - Turf', type:'Material' as const, crewType:'Formation' as const, units:99.47, uom:'m2', unitCost:18, total:1790.46, markupPercent:61, revenue:2882.64, notes:'' },
    { id:'q1369-52', estimateId:'q1369-est-1', displayOrder:'9.5', category:'Soft Landscaping', description:'Sure crop mulch', type:'Material' as const, crewType:'Formation' as const, units:15, uom:'m3', unitCost:125, total:1875, markupPercent:61, revenue:3018.75, notes:'' },
    { id:'q1369-53', estimateId:'q1369-est-1', displayOrder:'9.6', category:'Soft Landscaping', description:'Topsoil', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'each', unitCost:1200, total:1200, markupPercent:61, revenue:1932, notes:'' },
    { id:'q1369-54', estimateId:'q1369-est-1', displayOrder:'9.7', category:'Soft Landscaping', description:'Shapescaper steel edging 100x2mm', type:'Material' as const, crewType:'Formation' as const, units:27.1, uom:'lm', unitCost:25, total:677.5, markupPercent:61, revenue:1090.78, notes:'' },
    { id:'q1369-55', estimateId:'q1369-est-1', displayOrder:'9.8', category:'Soft Landscaping', description:'Drainage cell 50mm', type:'Material' as const, crewType:'Formation' as const, units:40, uom:'m2', unitCost:41.14, total:1645.6, markupPercent:61, revenue:2649.42, notes:'' },
    { id:'q1369-56', estimateId:'q1369-est-1', displayOrder:'9.9', category:'Soft Landscaping', description:'Geofabric 50m roll', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'each', unitCost:80, total:160, markupPercent:61, revenue:257.6, notes:'' },
    { id:'q1369-57', estimateId:'q1369-est-1', displayOrder:'9.10', category:'Soft Landscaping', description:'Labour - Planter box prep & edging', type:'Labour' as const, crewType:'Formation' as const, units:40, uom:'Hour', unitCost:68, total:2720, markupPercent:92.5, revenue:5236, notes:'' },
    { id:'q1369-58', estimateId:'q1369-est-1', displayOrder:'9.11', category:'Soft Landscaping', description:'Labour - Soil import management', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'Hour', unitCost:68, total:1088, markupPercent:92.5, revenue:2094.4, notes:'' },
    { id:'q1369-59', estimateId:'q1369-est-1', displayOrder:'9.12', category:'Soft Landscaping', description:'Labour - Planting', type:'Labour' as const, crewType:'Formation' as const, units:200, uom:'Hour', unitCost:68, total:13600, markupPercent:92.5, revenue:26180, notes:'' },
    { id:'q1369-60', estimateId:'q1369-est-1', displayOrder:'9.13', category:'Soft Landscaping', description:'Labour - Turf', type:'Labour' as const, crewType:'Formation' as const, units:32, uom:'Hour', unitCost:68, total:2176, markupPercent:92.5, revenue:4188.8, notes:'' },
    { id:'q1369-61', estimateId:'q1369-est-1', displayOrder:'9.14', category:'Soft Landscaping', description:'Labour - Mulch & cleaning', type:'Labour' as const, crewType:'Formation' as const, units:80, uom:'Hour', unitCost:68, total:5440, markupPercent:92.5, revenue:10472, notes:'' },
    { id:'q1369-62', estimateId:'q1369-est-1', displayOrder:'9.15', category:'Soft Landscaping', description:'Ecodynamics - Soil blow truck ~300mm', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:86, uom:'m3', unitCost:180, total:15480, markupPercent:66, revenue:25696.8, notes:'' },
    { id:'q1369-63', estimateId:'q1369-est-1', displayOrder:'9.16', category:'Soft Landscaping', description:'Freight', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:1000, total:1000, markupPercent:66, revenue:1660, notes:'' },
    { id:'q1369-64', estimateId:'q1369-est-1', displayOrder:'11.1', category:'Irrigation', description:'Irrigation system', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:3500, total:3500, markupPercent:61, revenue:5635, notes:'' },
    { id:'q1369-65', estimateId:'q1369-est-1', displayOrder:'11.2', category:'Irrigation', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:88, uom:'hour', unitCost:68, total:5984, markupPercent:92.5, revenue:11519.2, notes:'' },
    { id:'q1369-66', estimateId:'q1369-est-1', displayOrder:'12.1', category:'Lighting', description:'FIREFLY 3W Accent light', type:'Material' as const, crewType:'Formation' as const, units:64, uom:'ea', unitCost:80, total:5120, markupPercent:61, revenue:8243.2, notes:'' },
    { id:'q1369-67', estimateId:'q1369-est-1', displayOrder:'12.2', category:'Lighting', description:'LOTUS 5W Accent light', type:'Material' as const, crewType:'Formation' as const, units:4, uom:'ea', unitCost:140, total:560, markupPercent:61, revenue:901.6, notes:'' },
    { id:'q1369-68', estimateId:'q1369-est-1', displayOrder:'12.3', category:'Lighting', description:'SPECTRUM 6W Path light', type:'Material' as const, crewType:'Formation' as const, units:3, uom:'each', unitCost:150, total:450, markupPercent:61, revenue:724.5, notes:'' },
    { id:'q1369-69', estimateId:'q1369-est-1', displayOrder:'12.4', category:'Lighting', description:'KEO 3W In ground uplight', type:'Material' as const, crewType:'Formation' as const, units:5, uom:'each', unitCost:80, total:400, markupPercent:61, revenue:644, notes:'' },
    { id:'q1369-70', estimateId:'q1369-est-1', displayOrder:'12.5', category:'Lighting', description:'4mm Cable', type:'Material' as const, crewType:'Formation' as const, units:3, uom:'Roll', unitCost:200, total:600, markupPercent:61, revenue:966, notes:'' },
    { id:'q1369-71', estimateId:'q1369-est-1', displayOrder:'12.6', category:'Lighting', description:'Heat shrinks', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:61, revenue:241.5, notes:'' },
    { id:'q1369-72', estimateId:'q1369-est-1', displayOrder:'12.7', category:'Lighting', description:'Drivers', type:'Material' as const, crewType:'Formation' as const, units:6, uom:'each', unitCost:175, total:1050, markupPercent:61, revenue:1690.5, notes:'' },
    { id:'q1369-73', estimateId:'q1369-est-1', displayOrder:'12.8', category:'Lighting', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:72, uom:'hour', unitCost:68, total:4896, markupPercent:92.5, revenue:9424.8, notes:'' },
  ]
  const totalRevenue = items.reduce((s,i) => s+i.revenue, 0)
  const allProjects = loadProjects()
  const pi = allProjects.findIndex(p => p.id === 'q1369')
  if (pi >= 0) { allProjects[pi].contractValue = Math.round(totalRevenue/1000)*1000; localStorage.setItem('fg_projects', JSON.stringify(allProjects)) }
  saveEstimate({ id:'q1369-est-1', projectId:'q1369', projectName:'Dedic Residence', name:'Dedic Residence Import', version:1, status:'draft', defaultMarkupFormation:61, defaultMarkupSubcontractor:51, lineItems:items, notes:'', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() })
}


export function seedQ1243Estimate(): void {
  if (typeof window === 'undefined') return
  if (loadEstimates().find(e => e.id === 'q1243-est-1')) return

  const projects = loadProjects()
  if (!projects.find(p => p.id === 'gelbak')) {
    saveProject({
      id: 'gelbak', entity: 'formation' as const, name: 'Gelbak Residence',
      address: '45 Beach Road, Mentone VIC', clientName: 'Leon and Anya Gelbak',
      status: 'active' as const, contractValue: 950000, startDate: '',
      plannedCompletion: '', foreman: 'CAM', notes: 'Large high-end estate. Marina Road facing property.',
      createdAt: new Date().toISOString()
    })
  }

  const categories = [
    { order: '1',  cat: 'Retaining walls - front entrance wall',                cost: 9187,  revenue: 17837  },
    { order: '2',  cat: 'In-situ concrete - Front entrance steps (Marina)',       cost: 19930, revenue: 41404  },
    { order: '3',  cat: 'In-situ concrete - Front entrance steps (Beach road)',   cost: 9255,  revenue: 19274  },
    { order: '4',  cat: 'In-situ concrete - Trampoline steps',                   cost: 7090,  revenue: 15216  },
    { order: '5',  cat: 'In-situ concrete - Pool coping',                        cost: 6600,  revenue: 13867  },
    { order: '6',  cat: 'In-situ concrete - Stepping stones',                    cost: 3500,  revenue: 7277   },
    { order: '7',  cat: 'Paving - Poolside on pods',                             cost: 16430, revenue: 34862  },
    { order: '8',  cat: 'Paving - Balconies and rooftop terrace',                cost: 15580, revenue: 33543  },
    { order: '9',  cat: 'Paving - Balance of paving (not on pods)',              cost: 13156, revenue: 25305  },
    { order: '10', cat: 'Base for Sauna',                                        cost: 2540,  revenue: 4306   },
    { order: '11', cat: 'Marina Road fences',                                    cost: 33464, revenue: 46750  },
    { order: '12', cat: 'Pool fencing',                                          cost: 17600, revenue: 25362  },
    { order: '13', cat: 'Poolside planters',                                     cost: 17780, revenue: 27264  },
    { order: '14', cat: 'Water feature',                                         cost: 9350,  revenue: 16177  },
    { order: '15', cat: 'Vertical garden wall',                                  cost: 5218,  revenue: 10022  },
    { order: '16', cat: 'Soft Landscaping',                                      cost: 86280, revenue: 165206 },
    { order: '17', cat: 'Irrigation',                                            cost: 7620,  revenue: 15871  },
    { order: '18', cat: 'Lighting',                                              cost: 28950, revenue: 51258  },
    { order: '19', cat: 'Pedestrian gates x 2',                                  cost: 5600,  revenue: 7454   },
    { order: '20', cat: 'Steel rods for front fence',                            cost: 17405, revenue: 23166  },
    { order: '21', cat: 'Boundary retaining wall & screen',                      cost: 12352, revenue: 23646  },
    { order: '22', cat: 'NE Marina rd entrance design',                          cost: 21804, revenue: 39409  },
    { order: '23', cat: 'IN SITU - Retaining walls for rear entrance',           cost: 16321, revenue: 30957  },
    { order: '24', cat: 'Paving - Pods and mortar install',                      cost: 24801, revenue: 44719  },
    { order: '25', cat: 'Driveway - Luca filetti paving',                        cost: 24939, revenue: 46148  },
    { order: '26', cat: 'Stacked stone cladding',                                cost: 40157, revenue: 80392  },
    { order: '27', cat: 'Footpaths removed & replaced',                          cost: 34968, revenue: 59792  },
    { order: '28', cat: 'Archbar mesh screens',                                  cost: 20147, revenue: 36080  },
    { order: '30', cat: 'In situ concrete - Curved tiered walls',                cost: 5428,  revenue: 10412  },
  ]

  const items: EstimateLineItem[] = categories.map((c, i) => ({
    id: `q1243-item-${i}`,
    estimateId: 'q1243-est-1',
    displayOrder: c.order,
    category: c.cat,
    description: c.cat,
    type: 'Subcontractor' as const,
    crewType: 'Formation' as const,
    units: 1,
    uom: 'Allowance',
    unitCost: c.cost,
    total: c.cost,
    markupPercent: Math.round(((c.revenue - c.cost) / c.cost) * 100),
    revenue: c.revenue,
    notes: '',
  }))

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)

  const allProjects = loadProjects()
  const pi = allProjects.findIndex(p => p.id === 'gelbak')
  if (pi >= 0) {
    allProjects[pi].contractValue = Math.round(totalRevenue / 1000) * 1000
    localStorage.setItem('fg_projects', JSON.stringify(allProjects))
  }

  saveEstimate({
    id: 'q1243-est-1', projectId: 'gelbak', projectName: 'Gelbak Residence',
    name: 'q1243 — Gelbak Landscape & Hardscape',
    version: 1, status: 'accepted' as const,
    defaultMarkupFormation: 62.5, defaultMarkupSubcontractor: 46,
    lineItems: items,
    notes: 'Major estate. 45 Beach Road, Mentone. Multiple retaining walls, stone cladding, pods paving, full landscaping.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
}

export function seedQ1266Estimate(): void {
  if (typeof window === 'undefined') return
  if (loadEstimates().find(e => e.id === 'q1266-est-1')) return

  // SERPELLS project already exists — update client name and address
  // Project may be stored under id '2' (numeric) or 'serpells'
  const allProjects = loadProjects()
  const pi = allProjects.findIndex(p => p.id === 'serpells' || p.id === '2' || (p.name && p.name.toLowerCase().includes('serpells')))
  if (pi >= 0) {
    allProjects[pi].clientName = 'Tim Hockham'
    allProjects[pi].address = '165 Serpells Road, Templestowe VIC'
    localStorage.setItem('fg_projects', JSON.stringify(allProjects))
  }

  const categories = [
    { order: '1',  cat: 'Paving - Rear alfresco & steppers',                          cost: 11348, revenue: 23459, note: '~15m2 + 3 steps'                                 },
    { order: '2',  cat: 'Paving - Side pathway',                                       cost: 5760,  revenue: 12058, note: '10m2'                                             },
    { order: '3',  cat: 'Paving - Front portico crazy paving',                         cost: 7241,  revenue: 14991, note: '20m2'                                             },
    { order: '4',  cat: 'Paving - Front porch and portico border',                     cost: 8090,  revenue: 15944, note: '30m2'                                             },
    { order: '5',  cat: 'Paving - Rear paving lower level',                            cost: 27764, revenue: 49335, note: '76m2'                                             },
    { order: '6',  cat: 'Paving - West of alfresco',                                   cost: 3506,  revenue: 7295,  note: '8m2'                                              },
    { order: '7',  cat: 'In-situ concrete - Pool deck and steps',                      cost: 17780, revenue: 36106, note: ''                                                  },
    { order: '8',  cat: 'In-situ concrete - Wall behind pool deck',                    cost: 9330,  revenue: 19337, note: '11.3lm'                                           },
    { order: '9',  cat: 'Exposed aggregate concrete - Driveway & Western sideway',     cost: 30600, revenue: 49144, note: '180m2'                                            },
    { order: '10', cat: 'Pool fence',                                                  cost: 17900, revenue: 26778, note: ''                                                  },
    { order: '11', cat: 'Fireplace',                                                   cost: 21480, revenue: 36459, note: 'Jetmaster insert, brickwork, chimney'              },
    { order: '12', cat: 'Water feature',                                               cost: 14235, revenue: 25810, note: 'Stainless steel pond'                              },
    { order: '13', cat: 'Soft Landscaping',                                            cost: 44090, revenue: 88718, note: '$18k plant supply'                                },
    { order: '14', cat: 'Irrigation',                                                  cost: 8750,  revenue: 10684, note: '7 stations'                                       },
    { order: '15', cat: 'Lighting',                                                    cost: 17030, revenue: 32418, note: '45 accent lights, LED strip, path & pond lights'  },
    { order: '16', cat: 'Pool barrier - aluminium slat',                               cost: 4600,  revenue: 7388,  note: '2 sections'                                       },
    { order: '17', cat: 'Front entrance tile screed & threshold drain',                cost: 6061,  revenue: 10727, note: '35.85m2'                                          },
    { order: '18', cat: 'Portico slab extension & driveway drain',                     cost: 3995,  revenue: 7798,  note: ''                                                  },
    { order: '19', cat: 'Additional labour - large format tiles',                      cost: 5116,  revenue: 10240, note: 'Screed & glue method'                             },
    { order: '20', cat: 'In-situ concrete - Pool coping',                              cost: 4420,  revenue: 8527,  note: '32mpa concrete'                                   },
    { order: '21', cat: 'Paving slab support piers',                                   cost: 4975,  revenue: 9480,  note: ''                                                  },
    { order: '22', cat: 'Exposed aggregate concrete - Eastern side',                   cost: 6083,  revenue: 9770,  note: '38.02m2'                                          },
    { order: '23', cat: 'Alfresco step manufacture & install',                         cost: 3612,  revenue: 6655,  note: 'Projet cutting'                                   },
    { order: '24', cat: 'Planter rings - front & backyard level raise',                cost: 800,   revenue: 1373,  note: '8 rings'                                          },
  ]

  const items: EstimateLineItem[] = categories.map((c, i) => ({
    id: `q1266-item-${i}`,
    estimateId: 'q1266-est-1',
    displayOrder: c.order,
    category: c.cat,
    description: c.cat,
    type: c.cat.toLowerCase().includes('concrete') || c.cat.startsWith('Paving') ? 'Material' as const : 'Subcontractor' as const,
    crewType: 'Formation' as const,
    units: 1,
    uom: 'Allowance',
    unitCost: c.cost,
    total: c.cost,
    markupPercent: Math.round(((c.revenue - c.cost) / c.cost) * 100),
    revenue: c.revenue,
    notes: c.note,
  }))

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)

  const allProjects2 = loadProjects()
  const pi2 = allProjects2.findIndex(p => p.id === 'serpells' || p.id === '2' || (p.name && p.name.toLowerCase().includes('serpells')))
  const serpellsId = pi2 >= 0 ? allProjects2[pi2].id : 'serpells'
  if (pi2 >= 0) {
    allProjects2[pi2].contractValue = Math.round(totalRevenue / 1000) * 1000
    localStorage.setItem('fg_projects', JSON.stringify(allProjects2))
  }

  saveEstimate({
    id: 'q1266-est-1', projectId: serpellsId, projectName: 'Serpells',
    name: 'q1266 — Serpells / Hockham Landscape',
    version: 1, status: 'accepted' as const,
    defaultMarkupFormation: 62.5, defaultMarkupSubcontractor: 46,
    lineItems: items,
    notes: 'Tim Hockham, 165 Serpells Road Templestowe. Pool deck, fireplace, exposed aggregate driveway, full landscaping.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
}

export function seedQ1320Estimate(): void {
  if (typeof window === 'undefined') return
  if (loadEstimates().find(e => e.id === 'q1320-est-1')) return

  // Update SIDWELL project with real client details
  const allProjects = loadProjects()
  const pi = allProjects.findIndex(p => p.id === 'sidwell' || p.id === '4' || (p.name && p.name.toLowerCase().includes('sidwell')))
  if (pi >= 0) {
    allProjects[pi].clientName = 'Mark and Laura Davis'
    allProjects[pi].address = '5 Sidwell Ave, East St Kilda VIC'
    localStorage.setItem('fg_projects', JSON.stringify(allProjects))
  }

  const categories = [
    { order: '1',  cat: 'Preliminaries',                        cost: 5000,  revenue: 6930,  note: ''                                                                 },
    { order: '2',  cat: 'Site preparation / Demo',              cost: 30500, revenue: 43153, note: 'Decking & pool barrier demo, site prep'                           },
    { order: '3',  cat: 'Timber decking',                       cost: 62900, revenue: 90694, note: '132m2 merbau deck, 3 x stairs, curves to pool. TD Built QU-0511' },
    { order: '4',  cat: 'Pool equipment enclosure',             cost: 2755,  revenue: 5260,  note: 'Drainage, sump pump, gate'                                        },
    { order: '5',  cat: 'Concrete sleeper raised garden beds',  cost: 13464, revenue: 22319, note: 'TD Built + drainage'                                              },
    { order: '6',  cat: 'In-situ concrete - Pool coping',       cost: 5540,  revenue: 11104, note: '32mpa concrete'                                                   },
    { order: '7',  cat: 'In situ concrete steppers',            cost: 2100,  revenue: 4136,  note: ''                                                                 },
    { order: '8',  cat: 'Pergola (SSF)',                        cost: 7850,  revenue: 13471, note: 'Superb Steel Fabrication'                                         },
    { order: '9',  cat: 'Pool barrier (PPF)',                   cost: 17223, revenue: 27660, note: 'Steel + glass sections'                                           },
    { order: '10', cat: 'Outdoor kitchen',                      cost: 17000, revenue: 24497, note: 'ADLER interiors AI70 - Caesarstone Porcelain bench'               },
    { order: '11', cat: 'Soft Landscaping',                     cost: 6520,  revenue: 9622,  note: 'Plants, soil, mulch, planting labour'                             },
    { order: '12', cat: 'Irrigation',                           cost: 1680,  revenue: 3415,  note: 'Small system'                                                     },
    { order: '13', cat: 'Lighting',                             cost: 5340,  revenue: 10494, note: 'LOTUS, ZERON, LUNAFLEX strip, MARC wall lights'                   },
    { order: '14', cat: 'Pool piers',                           cost: 12240, revenue: 20686, note: 'Steel cages, 6m3 concrete, formatube'                             },
  ]

  const items: EstimateLineItem[] = categories.map((c, i) => ({
    id: `q1320-item-${i}`,
    estimateId: 'q1320-est-1',
    displayOrder: c.order,
    category: c.cat,
    description: c.cat,
    type: 'Subcontractor' as const,
    crewType: 'Formation' as const,
    units: 1,
    uom: 'Allowance',
    unitCost: c.cost,
    total: c.cost,
    markupPercent: Math.round(((c.revenue - c.cost) / c.cost) * 100),
    revenue: c.revenue,
    notes: c.note,
  }))

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)

  const allProjects2 = loadProjects()
  const pi2 = allProjects2.findIndex(p => p.id === 'sidwell' || p.id === '4' || (p.name && p.name.toLowerCase().includes('sidwell')))
  const sidwellId = pi2 >= 0 ? allProjects2[pi2].id : 'sidwell'
  if (pi2 >= 0) {
    allProjects2[pi2].contractValue = Math.round(totalRevenue / 1000) * 1000
    localStorage.setItem('fg_projects', JSON.stringify(allProjects2))
  }

  saveEstimate({
    id: 'q1320-est-1', projectId: sidwellId, projectName: 'Sidwell',
    name: 'q1320 — Sidwell / Davis Landscape',
    version: 1, status: 'accepted' as const,
    defaultMarkupFormation: 62.5, defaultMarkupSubcontractor: 46,
    lineItems: items,
    notes: 'Mark and Laura Davis, 5 Sidwell Ave East St Kilda. Merbau deck, pool coping, outdoor kitchen, pool barrier.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
}

export function seedAllDesignProposals(): void {
  if (typeof window === 'undefined') return

  const proposals: DesignProposal[] = [
    {
      id: 'prop-chua',
      clientName: 'Wi Liem & Elysha Chua',
      clientEmail: '',
      projectAddress: '55 Bath Road, Glen Iris VIC',
      status: 'pending',
      phase1Fee: 12000,
      phase1Scope: '2D landscape concept plan. A selection of 3D still images from the model to illustrate key features and design intent. Design presentation meeting to walk through the concept and discuss preliminary construction costs.',
      phase2Fee: 3500,
      phase2Scope: 'Detailed planting schedule, including botanical and common names, container sizes, spacing, and quantities. Landscape specification.',
      validUntil: '2026-04-17',
      notes: 'Date: 17th March 2026',
      acceptanceToken: 'chua-token',
      createdAt: '2026-03-17T00:00:00.000Z',
    },
    {
      id: 'prop-sia',
      clientName: 'Yolanda and Chris Sia',
      clientEmail: '',
      projectAddress: '68 Riversdale Rd, Hawthorn VIC',
      status: 'pending',
      phase1Fee: 8400,
      phase1Scope: '2D Landscape plan. Materials and finishes. Prepare a selection of stills from the model. A meeting to discuss the design and associated construction costs.',
      phase2Fee: 3400,
      phase2Scope: 'Planting Schedule. 12v Landscape Lighting Plan. Front fence elevation and details. Water feature detail plan. Materials and finishes selections and schedule. Landscape specification.',
      validUntil: '2026-04-04',
      notes: 'Date: 4th March 2026. Via Chan Architecture - Sherry Zhang.',
      acceptanceToken: 'sia-token',
      createdAt: '2026-03-04T00:00:00.000Z',
    },
    {
      id: 'prop-lower-plenty',
      clientName: 'Rami & Nada Jurdi',
      clientEmail: 'rami@rjlegal.net.au',
      projectAddress: '19 and 21 Beleura Grove, Lower Plenty VIC',
      status: 'accepted',
      phase1Fee: 6000,
      phase1Scope: 'Development project landscape design. Planning compliant and commercially sound landscape outcome. Single phase scope.',
      phase2Fee: 0,
      phase2Scope: '',
      validUntil: '2026-04-03',
      notes: 'Date: 3rd March 2026. C/O Michael Still - Still Architecture. Development project.',
      acceptanceToken: 'lower-plenty-accepted',
      acceptedAt: '2026-03-03T00:00:00.000Z',
      acceptedByName: 'Rami Jurdi',
      createdAt: '2026-03-03T00:00:00.000Z',
    },
    {
      id: 'prop-katopodis',
      clientName: 'Chris and Athena Katopodis',
      clientEmail: 'athena@canterburyeyecare.com.au',
      projectAddress: '7 Somerset Road, Richmond VIC',
      status: 'accepted',
      phase1Fee: 7800,
      phase1Scope: '2D Landscape plan. Materials and finishes. Prepare a selection of stills from the model. A meeting to discuss the design and associated construction costs.',
      phase2Fee: 3000,
      phase2Scope: 'Planting Schedule. 12v Landscape Lighting Plan. Front fence elevation. Water feature detail plan. Materials and finishes selections and schedule. Landscape specification.',
      validUntil: '2026-04-25',
      notes: 'Date: 25th February 2026. Via Chan Architecture - Brett Hudson.',
      acceptanceToken: 'katopodis-accepted',
      acceptedAt: '2026-03-18T00:00:00.000Z',
      acceptedByName: 'Athena Katopodis',
      createdAt: '2026-02-25T00:00:00.000Z',
    },
    {
      id: 'prop-glen-iris',
      clientName: 'DayDot Property Developers',
      clientEmail: 'leanne@daydotgroup.com.au',
      projectAddress: '20 Mills Street, Glen Iris VIC',
      status: 'accepted',
      phase1Fee: 7500,
      phase1Scope: 'Concept design resolving interface between new dwelling, alfresco and pool. 2D landscape concept plan. Materials and finishes. 3D stills. Design meeting.',
      phase2Fee: 1500,
      phase2Scope: 'Design development documentation.',
      validUntil: '2026-03-23',
      notes: 'Date: 23rd February 2026. C/o Sarah Camilleri. Pool and landscape project.',
      acceptanceToken: 'glen-iris-accepted',
      acceptedAt: '2026-03-01T00:00:00.000Z',
      acceptedByName: 'Leanne',
      createdAt: '2026-02-23T00:00:00.000Z',
    },
    {
      id: 'prop-ganeson',
      clientName: 'Nathaniel & Georgia Ganeson',
      clientEmail: '',
      projectAddress: '6 Sutherland Rd, Armadale VIC',
      status: 'pending',
      phase1Fee: 8000,
      phase1Scope: 'Concept design development. 2D landscape concept plan - front and rear. 3D stills. Design meeting. Single phase proposal.',
      phase2Fee: 0,
      phase2Scope: '',
      validUntil: '2026-03-01',
      notes: 'Date: 30th January 2026.',
      acceptanceToken: 'ganeson-token',
      createdAt: '2026-01-30T00:00:00.000Z',
    },
    {
      id: 'prop-williams',
      clientName: 'Steve Williams',
      clientEmail: '',
      projectAddress: '2 Browning Street, Elwood VIC',
      status: 'pending',
      phase1Fee: 7500,
      phase1Scope: 'Phase 1 landscape design concept.',
      phase2Fee: 2500,
      phase2Scope: 'Phase 2 design development.',
      validUntil: '2026-02-28',
      notes: 'Date: 28th January 2026.',
      acceptanceToken: 'williams-token',
      createdAt: '2026-01-28T00:00:00.000Z',
    },
    {
      id: 'prop-malin',
      clientName: 'Oren Malin',
      clientEmail: 'oren@malinconstructions.com.au',
      projectAddress: '4 Langdon Road, Caulfield North VIC',
      status: 'accepted',
      phase1Fee: 8000,
      phase1Scope: '2D Landscape plan. Materials and finishes. Prepare a selection of stills from the model. A meeting to discuss the design and associated construction costs.',
      phase2Fee: 2000,
      phase2Scope: 'Planting Schedule. 12v Landscape Lighting Plan. Front fence elevation. Materials and finishes. Landscape specification.',
      validUntil: '2026-02-23',
      notes: 'Date: 23rd January 2026. C/o Elisa Justin.',
      acceptanceToken: 'malin-accepted',
      acceptedAt: '2026-01-23T00:00:00.000Z',
      acceptedByName: 'Oren Malin',
      createdAt: '2026-01-23T00:00:00.000Z',
    },
    {
      id: 'prop-joubert',
      clientName: 'Jo and Tony Joubert',
      clientEmail: '',
      projectAddress: '44 Ossett St, Sorrento VIC',
      status: 'pending',
      phase1Fee: 9500,
      phase1Scope: '2D Landscape plan. Materials and finishes. Prepare a selection of stills from the model. A meeting to discuss the design and associated construction costs.',
      phase2Fee: 2500,
      phase2Scope: 'Planting Schedule. 12v Landscape Lighting Plan. Front fence elevation. Water feature detail. Materials and finishes. Landscape specification.',
      validUntil: '2025-05-23',
      notes: 'Date: 23rd April 2025. Discount applied: -$2,400.',
      acceptanceToken: 'joubert-design-token',
      createdAt: '2025-04-23T00:00:00.000Z',
    },
    {
      id: 'prop-meier',
      clientName: 'Lisa & Martin Meier',
      clientEmail: '',
      projectAddress: '13 Polo Parade, Caulfield North VIC',
      status: 'pending',
      phase1Fee: 5000,
      phase1Scope: 'Phase 1 landscape design concept.',
      phase2Fee: 2000,
      phase2Scope: 'Phase 2 design development.',
      validUntil: '2026-01-11',
      notes: 'Date: 11th December 2025.',
      acceptanceToken: 'meier-token',
      createdAt: '2025-12-11T00:00:00.000Z',
    },
    {
      id: 'prop-meiklejohn-brady',
      clientName: 'Daniel Meiklejohn & Estina Brady',
      clientEmail: 'estinarbrady@hotmail.com',
      projectAddress: '214 Patterson Road, Bentleigh VIC',
      status: 'accepted',
      phase1Fee: 8500,
      phase1Scope: 'Phase 1 landscape design concept.',
      phase2Fee: 4000,
      phase2Scope: 'Phase 2 design development.',
      validUntil: '2025-11-30',
      notes: 'Date: 31st October 2025.',
      acceptanceToken: 'meiklejohn-brady-accepted',
      acceptedAt: '2025-11-05T00:00:00.000Z',
      acceptedByName: 'Estina Brady',
      createdAt: '2025-10-31T00:00:00.000Z',
    },
    {
      id: 'prop-nossbaum',
      clientName: 'Eli and Tammy Nossbaum',
      clientEmail: '',
      projectAddress: '1 Albany Court, Caulfield North VIC',
      status: 'pending',
      phase1Fee: 8500,
      phase1Scope: 'Phase 1 landscape design concept.',
      phase2Fee: 4000,
      phase2Scope: 'Phase 2 design development.',
      validUntil: '2025-11-21',
      notes: 'Date: 21st October 2025.',
      acceptanceToken: 'nossbaum-token',
      createdAt: '2025-10-21T00:00:00.000Z',
    },
    {
      id: 'prop-mount-macedon',
      clientName: 'Mount Macedon Residence',
      clientEmail: '',
      projectAddress: '172 Anzac Road, Mount Macedon VIC',
      status: 'pending',
      phase1Fee: 8500,
      phase1Scope: 'Phase 1 landscape design concept.',
      phase2Fee: 3000,
      phase2Scope: 'Phase 2 design development.',
      validUntil: '2025-11-20',
      notes: 'Date: 20th October 2025. C/o Jillian Kenny - JAKarch.',
      acceptanceToken: 'mount-macedon-token',
      createdAt: '2025-10-20T00:00:00.000Z',
    },
    {
      id: 'prop-paringa',
      clientName: 'Paringa Road Residence',
      clientEmail: '',
      projectAddress: '19 Paringa Road, Portsea VIC',
      status: 'pending' as const,
      phase1Fee: 9500,
      phase1Scope: '2D landscape concept plan. A selection of 3D still images. Design presentation meeting to walk through the concept and discuss preliminary construction costs.',
      phase2Fee: 8500,
      phase2Scope: 'Detailed planting schedule. Landscape specification. Materials and finishes schedule.',
      validUntil: '2025-11-02',
      notes: 'Date: 2nd October 2025.',
      acceptanceToken: 'paringa-token',
      createdAt: '2025-10-02T00:00:00.000Z',
    },
    {
      id: 'prop-endersbee',
      clientName: 'The Endersbee Residence',
      clientEmail: 'jane@wildernesswear.com.au',
      projectAddress: 'Endersbee Residence VIC',
      status: 'accepted' as const,
      phase1Fee: 5500,
      phase1Scope: 'Phase 1 - Concept Design. 2D landscape concept plan. 3D stills. Design presentation meeting.',
      phase2Fee: 5500,
      phase2Scope: 'Phase 2 - Design Development. Planting schedule. Landscape specification. Materials schedule.',
      validUntil: '2025-09-14',
      notes: 'Date: 14th August 2025.',
      acceptanceToken: 'endersbee-accepted',
      acceptedAt: '2025-08-19T00:00:00.000Z',
      acceptedByName: 'Jane Endersbee',
      createdAt: '2025-08-14T00:00:00.000Z',
    },
    {
      id: 'prop-smith',
      clientName: 'Smith Residence',
      clientEmail: '',
      projectAddress: '10 Gordon Street, Hampton VIC',
      status: 'pending' as const,
      phase1Fee: 9000,
      phase1Scope: '2D Landscape plan. Materials and finishes. Prepare a selection of stills. Meeting to discuss design and construction costs.',
      phase2Fee: 2600,
      phase2Scope: 'Planting Schedule. 12v Landscape Lighting Plan. Materials and finishes schedule. Landscape specification.',
      validUntil: '2024-11-08',
      notes: 'Date: 8th October 2024.',
      acceptanceToken: 'smith-token',
      createdAt: '2024-10-08T00:00:00.000Z',
    },
    {
      id: 'prop-whittenbury',
      clientName: 'Glenn Whittenbury & Jenny Hatzis',
      clientEmail: 'gwhittenbury@icloud.com',
      projectAddress: '17 Uvadale Grove, Kew VIC',
      status: 'accepted',
      phase1Fee: 7000,
      phase1Scope: 'Phase 1 landscape design concept.',
      phase2Fee: 3500,
      phase2Scope: 'Phase 2 design development.',
      validUntil: '2025-11-08',
      notes: 'Date: 8th October 2025.',
      acceptanceToken: 'whittenbury-accepted',
      acceptedAt: '2025-10-09T00:00:00.000Z',
      acceptedByName: 'Glenn Whittenbury',
      createdAt: '2025-10-08T00:00:00.000Z',
    },
    // Additional proposals fetched from Qwilr
    {
      id: 'prop-bechler',
      clientName: 'Bechler Residence',
      clientEmail: '',
      projectAddress: 'Bechler Residence VIC',
      status: 'pending' as const,
      phase1Fee: 10800,
      phase1Scope: 'Concept design - 2D landscape plan, materials and finishes, 3D stills, design meeting.',
      phase2Fee: 2950,
      phase2Scope: 'Design development - planting schedule, lighting plan, materials schedule.',
      validUntil: '2023-02-13',
      notes: 'Date: 13th January 2023.',
      acceptanceToken: 'bechler-token',
      createdAt: '2023-01-13T00:00:00.000Z',
    },
    {
      id: 'prop-sorrento',
      clientName: 'Sorrento Residence',
      clientEmail: '',
      projectAddress: '781 Melbourne Road, Sorrento VIC',
      status: 'pending' as const,
      phase1Fee: 7500,
      phase1Scope: 'Concept design - 2D landscape plan, materials and finishes, 3D stills, design meeting.',
      phase2Fee: 3500,
      phase2Scope: 'Design development - planting schedule, lighting plan, materials schedule.',
      validUntil: '2026-01-16',
      notes: 'Date: 16th December 2025.',
      acceptanceToken: 'sorrento-token',
      createdAt: '2025-12-16T00:00:00.000Z',
    },
    {
      id: 'prop-kayakesen',
      clientName: 'Kayakesen & Pasika Residence',
      clientEmail: '',
      projectAddress: '56 Cole Street, Brighton VIC',
      status: 'pending' as const,
      phase1Fee: 9100,
      phase1Scope: 'Concept design - 2D landscape plan, materials and finishes, 3D stills, design meeting.',
      phase2Fee: 3200,
      phase2Scope: 'Design development - planting schedule, lighting plan, materials schedule.',
      validUntil: '2022-08-08',
      notes: 'Date: 8th July 2022.',
      acceptanceToken: 'kayakesen-token',
      createdAt: '2022-07-08T00:00:00.000Z',
    },
    {
      id: 'prop-haynes',
      clientName: 'Haynes Residence',
      clientEmail: '',
      projectAddress: '17 Kingston Road, Surrey Hills VIC',
      status: 'pending' as const,
      phase1Fee: 4000,
      phase1Scope: 'Phase 1 - Concept Design only.',
      phase2Fee: 0,
      phase2Scope: '',
      validUntil: '2025-12-19',
      notes: 'Date: 19th November 2025. Single phase proposal.',
      acceptanceToken: 'haynes-token',
      createdAt: '2025-11-19T00:00:00.000Z',
    },
    {
      id: 'prop-westcott',
      clientName: 'Westcott Residence',
      clientEmail: 'mwestcott@fuserecruitment.com',
      projectAddress: '3 Clifton Street, Richmond VIC',
      status: 'accepted' as const,
      phase1Fee: 7000,
      phase1Scope: 'Concept design - 2D landscape plan, materials and finishes, 3D stills, design meeting.',
      phase2Fee: 1250,
      phase2Scope: 'Design development.',
      validUntil: '2025-11-30',
      notes: 'Date: 31st October 2025.',
      acceptanceToken: 'westcott-accepted',
      acceptedAt: '2025-10-31T00:00:00.000Z',
      acceptedByName: 'M Westcott',
      createdAt: '2025-10-31T00:00:00.000Z',
    },
    {
      id: 'prop-flinders',
      clientName: 'Flinders Street & Endeavour Lane',
      clientEmail: '',
      projectAddress: '65 Flinders Street & 4 Endeavour Lane, McCrae VIC',
      status: 'pending' as const,
      phase1Fee: 7000,
      phase1Scope: 'Phase 1 - Landscape plan - Town Planning. Payment due in two installations.',
      phase2Fee: 0,
      phase2Scope: '',
      validUntil: '2025-12-07',
      notes: 'Date: 7th November 2025. Town planning project.',
      acceptanceToken: 'flinders-token',
      createdAt: '2025-11-07T00:00:00.000Z',
    },        {
      id: 'prop-blaufelder',
      clientName: 'James and Haley Blaufelder',
      clientEmail: 'jblaufelder85@gmail.com',
      projectAddress: '108 Kent Street, Richmond VIC',
      status: 'accepted' as const,
      phase1Fee: 6000,
      phase1Scope: 'Concept design - 2D landscape plan, materials and finishes, 3D stills, design meeting.',
      phase2Fee: 0,
      phase2Scope: '',
      validUntil: '2025-11-06',
      notes: 'Date: 6th October 2025. Single phase proposal.',
      acceptanceToken: 'blaufelder-prop-accepted',
      acceptedAt: '2025-10-06T00:00:00.000Z',
      acceptedByName: 'James Blaufelder',
      createdAt: '2025-10-06T00:00:00.000Z',
    },
  ]
  
  // Save all proposals (skip if already exists)
  const existing = loadProposals()
  proposals.forEach(p => {
    if (!existing.find(e => e.id === p.id)) {
      saveProposal(p)
    }
  })

  // Force regenerate revenue for ALL accepted design proposals
  const allSaved = loadProposals()
  allSaved.filter(p => p.status === 'accepted').forEach(p => generateRevenueFromProposal(p))
}

export function seedCachiaProposal(): void {
  if (typeof window === 'undefined') return
  if (loadProposals().find(p => p.id === 'cachia-prop-1')) return

  const proposal: DesignProposal = {
    id: 'cachia-prop-1',
    clientName: 'John and Burcu Cachia',
    clientEmail: 'john.cachia@thrivingwealth.com.au',
    clientPhone: '',
    projectAddress: '95 Clifton St, Aberfeldie VIC',
    status: 'accepted',
    phase1Fee: 9800,
    phase1Scope: '2D Landscape plan. Materials and finishes - extent and type of hard surfacing for pathways, decking, etc. Prepare a selection of stills from the model to describe features and details in 3D for in-depth discussion. A meeting to discuss the design and associated construction costs.',
    phase2Fee: 3500,
    phase2Scope: 'Planting Schedule nominating and locating all planting (botanical names, common names, container sizes, spacing, quantities). 12v Landscape Lighting Plan including location of fittings, lighting schedule with specification of fittings & quantities, lamp types, zoning/switching. Front fence elevation and details plan. Water feature detail plan. Materials and finishes selections and schedule. Landscape specification - finished surface levels.',
    validUntil: '2026-04-16',
    notes: 'Attend client meetings as required. Attend design meetings as required.\n\nNot included: Further documentation for permitted items not covered above. Fees associated with submission to local authorities. Engineering documentation.\n\nTimeline: 6 weeks to complete Phase 1, Phase 2 to follow once concept confirmed.',
    acceptanceToken: 'cachia-accepted',
    acceptedAt: '2026-03-17T00:00:00.000Z',
    acceptedByName: 'John Cachia',
    createdAt: '2026-03-16T00:00:00.000Z',
  }

  saveProposal(proposal)

  // Generate revenue entries for this accepted proposal
  generateRevenueFromProposal(loadProposals().find(p => p.id === 'cachia-prop-1')!)
}

export function seedDesignProjects(): void {
  if (typeof window === 'undefined') return

  // Map proposal IDs to their seed data
  const proposals = loadProposals()

  type PhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'invoiced' | 'paid'

  interface SeedProjectData {
    proposalId: string
    phase1Status: PhaseStatus
    phase1DueDate: string
    phase1DepositPaid: boolean
    phase1DepositDate?: string
    phase1CompletedDate?: string
    phase1PaidDate?: string
    phase1InvoicedDate?: string
    phase2Status: PhaseStatus
    phase2DueDate?: string
    phase2CompletedDate?: string
    phase2PaidDate?: string
    phase2InvoicedDate?: string
    totalPaid: number
  }

  const seedData: SeedProjectData[] = [
    // Cachia (accepted 17 Mar 2026) ? P1 due 28 Apr 2026
    {
      proposalId: 'cachia-prop-1',
      phase1Status: 'not_started',
      phase1DueDate: '2026-04-28',
      phase1DepositPaid: false,
      phase2Status: 'not_started',
      totalPaid: 0,
    },
    // Jurdi/Lower Plenty (accepted 3 Mar 2026) ? P1 due 14 Apr 2026
    {
      proposalId: 'prop-lower-plenty',
      phase1Status: 'not_started',
      phase1DueDate: '2026-04-14',
      phase1DepositPaid: false,
      phase2Status: 'not_started',
      totalPaid: 0,
    },
    // Katopodis (accepted 18 Mar 2026) ? P1 due 29 Apr 2026
    {
      proposalId: 'prop-katopodis',
      phase1Status: 'not_started',
      phase1DueDate: '2026-04-29',
      phase1DepositPaid: false,
      phase2Status: 'not_started',
      totalPaid: 0,
    },
    // Glen Iris/DayDot (accepted 1 Mar 2026) ? P1 due 12 Apr 2026, P1 deposit paid
    {
      proposalId: 'prop-glen-iris',
      phase1Status: 'in_progress',
      phase1DueDate: '2026-04-12',
      phase1DepositPaid: true,
      phase1DepositDate: '2026-03-05',
      phase2Status: 'not_started',
      totalPaid: 0,
    },
    // Malin (accepted 23 Jan 2026) ? P1 In Progress, deposit paid, due 6 Mar 2026
    {
      proposalId: 'prop-malin',
      phase1Status: 'in_progress',
      phase1DueDate: '2026-03-06',
      phase1DepositPaid: true,
      phase1DepositDate: '2026-01-27',
      phase2Status: 'not_started',
      totalPaid: 0,
    },
    // Meiklejohn-Brady (accepted 5 Nov 2025) ? P1 Complete, P2 In Progress
    {
      proposalId: 'prop-meiklejohn-brady',
      phase1Status: 'paid',
      phase1DueDate: '2025-12-17',
      phase1DepositPaid: true,
      phase1DepositDate: '2025-11-10',
      phase1CompletedDate: '2025-12-15',
      phase1PaidDate: '2025-12-20',
      phase2Status: 'in_progress',
      phase2DueDate: '2026-02-28',
      totalPaid: 8500,
    },
    // Whittenbury (accepted 9 Oct 2025) ? P1 Paid, P2 Invoiced
    {
      proposalId: 'prop-whittenbury',
      phase1Status: 'paid',
      phase1DueDate: '2025-11-20',
      phase1DepositPaid: true,
      phase1DepositDate: '2025-10-14',
      phase1CompletedDate: '2025-11-18',
      phase1PaidDate: '2025-11-25',
      phase2Status: 'invoiced',
      phase2DueDate: '2026-01-31',
      phase2InvoicedDate: '2026-01-20',
      totalPaid: 7000,
    },
    // Endersbee (accepted 19 Aug 2025) ? Both phases complete/paid
    {
      proposalId: 'prop-endersbee',
      phase1Status: 'paid',
      phase1DueDate: '2025-09-30',
      phase1DepositPaid: true,
      phase1DepositDate: '2025-08-22',
      phase1CompletedDate: '2025-09-28',
      phase1PaidDate: '2025-10-05',
      phase2Status: 'paid',
      phase2DueDate: '2025-12-15',
      phase2CompletedDate: '2025-12-10',
      phase2PaidDate: '2025-12-18',
      totalPaid: 11000,
    },
  ]

  seedData.forEach(data => {
    const existing = loadDesignProjectByProposalId(data.proposalId)
    if (existing) return

    const proposal = proposals.find(p => p.id === data.proposalId)
    if (!proposal || proposal.status !== 'accepted') return

    const totalFee = proposal.phase1Fee + proposal.phase2Fee + (proposal.phase3Fee || 0)

    const project: DesignProject = {
      id: generateId(),
      proposalId: data.proposalId,
      clientName: proposal.clientName,
      projectAddress: proposal.projectAddress || '',
      entity: 'design',
      phase1Fee: proposal.phase1Fee,
      phase1Status: data.phase1Status,
      phase1DueDate: data.phase1DueDate,
      phase1DepositPaid: data.phase1DepositPaid,
      phase1DepositDate: data.phase1DepositDate,
      phase1CompletedDate: data.phase1CompletedDate,
      phase1PaidDate: data.phase1PaidDate,
      phase1InvoicedDate: data.phase1InvoicedDate,
      phase2Fee: proposal.phase2Fee,
      phase2Status: data.phase2Status,
      phase2DueDate: data.phase2DueDate,
      phase2CompletedDate: data.phase2CompletedDate,
      phase2PaidDate: data.phase2PaidDate,
      phase2InvoicedDate: data.phase2InvoicedDate,
      phase3Fee: proposal.phase3Fee,
      phase3Status: proposal.phase3Fee ? 'not_started' : undefined,
      totalFee,
      totalPaid: data.totalPaid,
      totalOutstanding: totalFee - data.totalPaid,
      notes: '',
      createdAt: proposal.acceptedAt || proposal.createdAt,
      updatedAt: new Date().toISOString(),
      acceptedAt: proposal.acceptedAt,
    }

    saveDesignProject(project)
  })
}

export function seedRamondettaPayments(): void {
  if (typeof window === 'undefined') return

  const existing = loadProgressPaymentStages('samara')
  if (existing.length > 0) return

  const stages = [
    { id: 'samara-stage-21', projectId: 'samara', stageNumber: '2.1', description: 'Preliminary Works', quotedAmount: 8228, paidToDate: 8228, status: 'paid' as const, invoiceNumber: '', invoicedDate: '2025-08-15', invoicedAmount: 8228 },
    { id: 'samara-stage-22a', projectId: 'samara', stageNumber: '2.2a', description: 'Excavation and reinforcement steel', quotedAmount: 13988, paidToDate: 13988, status: 'paid' as const, invoiceNumber: '', invoicedDate: '2025-09-10', invoicedAmount: 13988 },
    { id: 'samara-stage-22b', projectId: 'samara', stageNumber: '2.2b', description: 'Internal plumbing and structural shell', quotedAmount: 13988, paidToDate: 13988, status: 'paid' as const, invoiceNumber: '', invoicedDate: '2025-10-20', invoicedAmount: 13988 },
    { id: 'samara-stage-23', projectId: 'samara', stageNumber: '2.3', description: 'Installation of filtration equipment', quotedAmount: 57596, paidToDate: 57596, status: 'paid' as const, invoiceNumber: '', invoicedDate: '2025-11-15', invoicedAmount: 57596 },
    { id: 'samara-stage-25', projectId: 'samara', stageNumber: '2.5', description: 'Completion of tiling (Mid-April 2026)', quotedAmount: 32912, paidToDate: 0, status: 'pending' as const, invoiceNumber: '' },
    { id: 'samara-stage-26', projectId: 'samara', stageNumber: '2.6', description: 'Completion payment and handover (Easter 2026)', quotedAmount: 32912, paidToDate: 0, status: 'pending' as const, invoiceNumber: '' },
    { id: 'samara-variation-1', projectId: 'samara', stageNumber: 'Variation', description: 'Variation - scope addition (May 2026)', quotedAmount: 4937, paidToDate: 0, status: 'pending' as const, invoiceNumber: '' },
  ]

  stages.forEach(s => saveProgressPaymentStage(s))
}

export function seedQ1331Estimate(): void {
  if (typeof window === 'undefined') return
  if (loadEstimates().find(e => e.id === 'q1331-est-1')) return

  // Create project if it doesn't exist (should already exist as 'samara')
  const projects = loadProjects()
  if (!projects.find(p => p.id === 'samara')) {
    saveProject({
      id: 'samara', entity: 'formation' as const, name: 'Samara',
      address: '16 Samara Road, Burnside VIC', clientName: 'Paul and Ulrika Ramondetta',
      status: 'active' as const, contractValue: 0, startDate: '',
      plannedCompletion: '', foreman: '', notes: '', createdAt: new Date().toISOString()
    })
  }

  const items: EstimateLineItem[] = [
    // Preliminaries
    { id:'q1331-1', estimateId:'q1331-est-1', displayOrder:'1.1', category:'Preliminaries', description:'Site toilet', type:'Equipment' as const, crewType:'Formation' as const, units:20, uom:'week', unitCost:65, total:1300, markupPercent:47.5, revenue:1919 },
    { id:'q1331-2', estimateId:'q1331-est-1', displayOrder:'1.2', category:'Preliminaries', description:'Hazard Co Site induction', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:450, total:450, markupPercent:47.5, revenue:664 },
    // Site preparation
    { id:'q1331-3', estimateId:'q1331-est-1', displayOrder:'2.1', category:'Site preparation', description:'Machine hire', type:'Equipment' as const, crewType:'Formation' as const, units:2, uom:'Day', unitCost:350, total:700, markupPercent:62.5, revenue:1138 },
    { id:'q1331-4', estimateId:'q1331-est-1', displayOrder:'2.2', category:'Site preparation', description:'8m3 Mixed heavy bin', type:'Material' as const, crewType:'Formation' as const, units:3, uom:'Ea', unitCost:1200, total:3600, markupPercent:62.5, revenue:5850 },
    { id:'q1331-5', estimateId:'q1331-est-1', displayOrder:'2.3', category:'Site preparation', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:48, uom:'hour', unitCost:55, total:2640, markupPercent:117.5, revenue:5742 },
    // Crazy paving
    { id:'q1331-6', estimateId:'q1331-est-1', displayOrder:'3.1', category:'Paving - Crazy paving', description:'Supply of paving', type:'Material' as const, crewType:'Formation' as const, units:55, uom:'m2', unitCost:110, total:6050, markupPercent:62.5, revenue:9831 },
    { id:'q1331-7', estimateId:'q1331-est-1', displayOrder:'3.2', category:'Paving - Crazy paving', description:'Paving slab (concrete base)', type:'Material' as const, crewType:'Formation' as const, units:5, uom:'10m2', unitCost:425, total:2125, markupPercent:62.5, revenue:3453 },
    { id:'q1331-8', estimateId:'q1331-est-1', displayOrder:'3.3', category:'Paving - Crazy paving', description:'Hide lids', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'Allowance', unitCost:300, total:600, markupPercent:62.5, revenue:975 },
    { id:'q1331-9', estimateId:'q1331-est-1', displayOrder:'3.4', category:'Paving - Crazy paving', description:'150mm SS floor waste grating', type:'Material' as const, crewType:'Formation' as const, units:3, uom:'each', unitCost:150, total:450, markupPercent:62.5, revenue:731 },
    { id:'q1331-10', estimateId:'q1331-est-1', displayOrder:'3.5', category:'Paving - Crazy paving', description:'Slab prep labour', type:'Labour' as const, crewType:'Formation' as const, units:48, uom:'Hour', unitCost:55, total:2640, markupPercent:117.5, revenue:5742 },
    { id:'q1331-11', estimateId:'q1331-est-1', displayOrder:'3.6', category:'Paving - Crazy paving', description:'Paving labour', type:'Labour' as const, crewType:'Formation' as const, units:104, uom:'Hour', unitCost:55, total:5720, markupPercent:117.5, revenue:12441 },
    { id:'q1331-12', estimateId:'q1331-est-1', displayOrder:'3.7', category:'Paving - Crazy paving', description:'Grouting labour', type:'Labour' as const, crewType:'Formation' as const, units:24, uom:'Hour', unitCost:55, total:1320, markupPercent:117.5, revenue:2872 },
    { id:'q1331-13', estimateId:'q1331-est-1', displayOrder:'3.8', category:'Paving - Crazy paving', description:'Caulking', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:15, uom:'lm', unitCost:15, total:225, markupPercent:62.5, revenue:366 },
    // Bluestone steppers
    { id:'q1331-14', estimateId:'q1331-est-1', displayOrder:'4.1', category:'Paving - Bluestone steppers', description:'Paving supply', type:'Material' as const, crewType:'Formation' as const, units:11, uom:'ea', unitCost:60, total:660, markupPercent:62.5, revenue:1073 },
    { id:'q1331-15', estimateId:'q1331-est-1', displayOrder:'4.2', category:'Paving - Bluestone steppers', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'hour', unitCost:55, total:880, markupPercent:117.5, revenue:1914 },
    { id:'q1331-16', estimateId:'q1331-est-1', displayOrder:'4.3', category:'Paving - Bluestone steppers', description:'Paving installation materials', type:'Material' as const, crewType:'Formation' as const, units:10, uom:'m2', unitCost:17.65, total:176.5, markupPercent:62.5, revenue:287 },
    // Pool coping
    { id:'q1331-17', estimateId:'q1331-est-1', displayOrder:'5.1', category:'In-situ concrete - Pool coping', description:'Formwork materials', type:'Material' as const, crewType:'Formation' as const, units:0.7, uom:'Allowance', unitCost:1000, total:700, markupPercent:62.5, revenue:1138 },
    { id:'q1331-18', estimateId:'q1331-est-1', displayOrder:'5.2', category:'In-situ concrete - Pool coping', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:350, total:350, markupPercent:62.5, revenue:569 },
    { id:'q1331-19', estimateId:'q1331-est-1', displayOrder:'5.3', category:'In-situ concrete - Pool coping', description:'Steel mesh', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:62.5, revenue:244 },
    { id:'q1331-20', estimateId:'q1331-est-1', displayOrder:'5.4', category:'In-situ concrete - Pool coping', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:64, uom:'hour', unitCost:55, total:3520, markupPercent:117.5, revenue:7656 },
    // Outdoor kitchen bench
    { id:'q1331-21', estimateId:'q1331-est-1', displayOrder:'6.1', category:'In-situ concrete - Outdoor kitchen bench', description:'Formwork materials', type:'Material' as const, crewType:'Formation' as const, units:0.75, uom:'Allowance', unitCost:1000, total:750, markupPercent:62.5, revenue:1219 },
    { id:'q1331-22', estimateId:'q1331-est-1', displayOrder:'6.2', category:'In-situ concrete - Outdoor kitchen bench', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:350, total:350, markupPercent:62.5, revenue:569 },
    { id:'q1331-23', estimateId:'q1331-est-1', displayOrder:'6.3', category:'In-situ concrete - Outdoor kitchen bench', description:'Steel mesh', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:62.5, revenue:244 },
    { id:'q1331-24', estimateId:'q1331-est-1', displayOrder:'6.4', category:'In-situ concrete - Outdoor kitchen bench', description:'Lighting provisions', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:100, total:100, markupPercent:62.5, revenue:163 },
    { id:'q1331-25', estimateId:'q1331-est-1', displayOrder:'6.5', category:'In-situ concrete - Outdoor kitchen bench', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:88, uom:'hour', unitCost:55, total:4840, markupPercent:117.5, revenue:10527 },
    { id:'q1331-26', estimateId:'q1331-est-1', displayOrder:'6.6', category:'In-situ concrete - Outdoor kitchen bench', description:'Joinery', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:2000, total:2000, markupPercent:62.5, revenue:3250 },
    { id:'q1331-27', estimateId:'q1331-est-1', displayOrder:'6.7', category:'In-situ concrete - Outdoor kitchen bench', description:'Sealing', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:300, total:300, markupPercent:62.5, revenue:488 },
    // Front entrance steps
    { id:'q1331-28', estimateId:'q1331-est-1', displayOrder:'7.1', category:'Front entrance steps & wall', description:'Formwork materials', type:'Material' as const, crewType:'Formation' as const, units:0.5, uom:'Allowance', unitCost:1000, total:500, markupPercent:62.5, revenue:813 },
    { id:'q1331-29', estimateId:'q1331-est-1', displayOrder:'7.2', category:'Front entrance steps & wall', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'m3', unitCost:350, total:350, markupPercent:62.5, revenue:569 },
    { id:'q1331-30', estimateId:'q1331-est-1', displayOrder:'7.3', category:'Front entrance steps & wall', description:'Steel mesh', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:62.5, revenue:244 },
    { id:'q1331-31', estimateId:'q1331-est-1', displayOrder:'7.6', category:'Front entrance steps & wall', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:40, uom:'hour', unitCost:55, total:2200, markupPercent:117.5, revenue:4785 },
    { id:'q1331-32', estimateId:'q1331-est-1', displayOrder:'7.7', category:'Front entrance steps & wall', description:'Sealing', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Ea', unitCost:300, total:300, markupPercent:62.5, revenue:488 },
    // Bench seat & steppers
    { id:'q1331-33', estimateId:'q1331-est-1', displayOrder:'8.1', category:'Bench seat & steppers', description:'Formwork materials', type:'Material' as const, crewType:'Formation' as const, units:0.5, uom:'Allowance', unitCost:1000, total:500, markupPercent:62.5, revenue:813 },
    { id:'q1331-34', estimateId:'q1331-est-1', displayOrder:'8.2', category:'Bench seat & steppers', description:'Steel mesh', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:62.5, revenue:244 },
    { id:'q1331-35', estimateId:'q1331-est-1', displayOrder:'8.3', category:'Bench seat & steppers', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:2.5, uom:'m3', unitCost:425, total:1062.5, markupPercent:62.5, revenue:1727 },
    { id:'q1331-36', estimateId:'q1331-est-1', displayOrder:'8.5', category:'Bench seat & steppers', description:'Footing labour', type:'Labour' as const, crewType:'Formation' as const, units:8, uom:'hour', unitCost:55, total:440, markupPercent:117.5, revenue:957 },
    { id:'q1331-37', estimateId:'q1331-est-1', displayOrder:'8.6', category:'Bench seat & steppers', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:64, uom:'hour', unitCost:55, total:3520, markupPercent:117.5, revenue:7656 },
    { id:'q1331-38', estimateId:'q1331-est-1', displayOrder:'8.7', category:'Bench seat & steppers', description:'Sealing', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:300, total:300, markupPercent:62.5, revenue:488 },
    // Decking refurbishment
    { id:'q1331-39', estimateId:'q1331-est-1', displayOrder:'9.1', category:'Decking refurbishment', description:'TD BUILT - decking refurbishment', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:13800, total:13800, markupPercent:47.5, revenue:20349 },
    // Batten screen
    { id:'q1331-40', estimateId:'q1331-est-1', displayOrder:'10.1', category:'Batten screen', description:'Framing materials', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:2200, total:2200, markupPercent:62.5, revenue:3575 },
    { id:'q1331-41', estimateId:'q1331-est-1', displayOrder:'10.2', category:'Batten screen', description:'Cladding materials', type:'Material' as const, crewType:'Formation' as const, units:16.7, uom:'1.2lm', unitCost:300, total:5010, markupPercent:62.5, revenue:8141 },
    { id:'q1331-42', estimateId:'q1331-est-1', displayOrder:'10.3', category:'Batten screen', description:'Flatbar capping', type:'Material' as const, crewType:'Formation' as const, units:20.06, uom:'lm', unitCost:40, total:802.4, markupPercent:62.5, revenue:1304 },
    { id:'q1331-43', estimateId:'q1331-est-1', displayOrder:'10.4', category:'Batten screen', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'m3', unitCost:350, total:700, markupPercent:62.5, revenue:1138 },
    { id:'q1331-44', estimateId:'q1331-est-1', displayOrder:'10.5', category:'Batten screen', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:88, uom:'Hour', unitCost:55, total:4840, markupPercent:117.5, revenue:10527 },
    { id:'q1331-45', estimateId:'q1331-est-1', displayOrder:'10.6', category:'Batten screen', description:'Planters', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:3, uom:'each', unitCost:1000, total:3000, markupPercent:62.5, revenue:4875 },
    { id:'q1331-46', estimateId:'q1331-est-1', displayOrder:'10.7', category:'Batten screen', description:'Core drilling - 200mm', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:7, uom:'each', unitCost:75, total:525, markupPercent:62.5, revenue:853 },
    // Pool equipment screen & gate
    { id:'q1331-47', estimateId:'q1331-est-1', displayOrder:'11.1', category:'Pool equipment screen & gate', description:'Cladding materials', type:'Material' as const, crewType:'Formation' as const, units:5, uom:'lm', unitCost:300, total:1500, markupPercent:62.5, revenue:2438 },
    { id:'q1331-48', estimateId:'q1331-est-1', displayOrder:'11.2', category:'Pool equipment screen & gate', description:'Steel gate frame, hinges & latch', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:750, total:750, markupPercent:62.5, revenue:1219 },
    { id:'q1331-49', estimateId:'q1331-est-1', displayOrder:'11.3', category:'Pool equipment screen & gate', description:'Framing materials', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:500, total:500, markupPercent:62.5, revenue:813 },
    { id:'q1331-50', estimateId:'q1331-est-1', displayOrder:'11.4', category:'Pool equipment screen & gate', description:'Paving slab', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'10m2', unitCost:425, total:425, markupPercent:62.5, revenue:691 },
    { id:'q1331-51', estimateId:'q1331-est-1', displayOrder:'11.5', category:'Pool equipment screen & gate', description:'Marine ply', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'Ea', unitCost:125, total:250, markupPercent:62.5, revenue:406 },
    { id:'q1331-52', estimateId:'q1331-est-1', displayOrder:'11.6', category:'Pool equipment screen & gate', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:0.5, uom:'m3', unitCost:350, total:175, markupPercent:62.5, revenue:284 },
    { id:'q1331-53', estimateId:'q1331-est-1', displayOrder:'11.7', category:'Pool equipment screen & gate', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:48, uom:'Hour', unitCost:55, total:2640, markupPercent:117.5, revenue:5742 },
    // Western side batten screen
    { id:'q1331-54', estimateId:'q1331-est-1', displayOrder:'12.1', category:'Western side batten screen', description:'Framing materials', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:1700, total:1700, markupPercent:62.5, revenue:2763 },
    { id:'q1331-55', estimateId:'q1331-est-1', displayOrder:'12.2', category:'Western side batten screen', description:'Cladding materials', type:'Material' as const, crewType:'Formation' as const, units:12.5, uom:'1.2lm', unitCost:300, total:3750, markupPercent:62.5, revenue:6094 },
    { id:'q1331-56', estimateId:'q1331-est-1', displayOrder:'12.3', category:'Western side batten screen', description:'Concrete', type:'Material' as const, crewType:'Formation' as const, units:1.5, uom:'m3', unitCost:350, total:525, markupPercent:62.5, revenue:853 },
    { id:'q1331-57', estimateId:'q1331-est-1', displayOrder:'12.4', category:'Western side batten screen', description:'Flat bar capping', type:'Material' as const, crewType:'Formation' as const, units:15.5, uom:'lm', unitCost:40, total:620, markupPercent:62.5, revenue:1008 },
    { id:'q1331-58', estimateId:'q1331-est-1', displayOrder:'12.5', category:'Western side batten screen', description:'Labour - screening', type:'Labour' as const, crewType:'Formation' as const, units:72, uom:'Hour', unitCost:55, total:3960, markupPercent:117.5, revenue:8613 },
    { id:'q1331-59', estimateId:'q1331-est-1', displayOrder:'12.6', category:'Western side batten screen', description:'Core drilling - 200mm', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:10, uom:'each', unitCost:75, total:750, markupPercent:62.5, revenue:1219 },
    // Aluminium pergola
    { id:'q1331-60', estimateId:'q1331-est-1', displayOrder:'13.1', category:'Aluminium pergola', description:'Aluminium pergola supply & install', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:4000, total:4000, markupPercent:62.5, revenue:6500 },
    { id:'q1331-61', estimateId:'q1331-est-1', displayOrder:'13.2', category:'Aluminium pergola', description:'Stainless steel wire', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:300, total:300, markupPercent:62.5, revenue:488 },
    { id:'q1331-62', estimateId:'q1331-est-1', displayOrder:'13.3', category:'Aluminium pergola', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'hour', unitCost:55, total:880, markupPercent:117.5, revenue:1914 },
    // Pool barrier
    { id:'q1331-63', estimateId:'q1331-est-1', displayOrder:'14.1', category:'Pool barrier', description:'Glass section fencing', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:6, uom:'lm', unitCost:550, total:3300, markupPercent:57.5, revenue:5198 },
    { id:'q1331-64', estimateId:'q1331-est-1', displayOrder:'14.2', category:'Pool barrier', description:'Steel section fencing', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:1, uom:'Allowance', unitCost:3000, total:3000, markupPercent:57.5, revenue:4725 },
    { id:'q1331-65', estimateId:'q1331-est-1', displayOrder:'14.3', category:'Pool barrier', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:16, uom:'Hour', unitCost:55, total:880, markupPercent:117.5, revenue:1914 },
    // Soft Landscaping
    { id:'q1331-66', estimateId:'q1331-est-1', displayOrder:'15.1', category:'Soft Landscaping', description:'Plant supply (incl espaliered citrus, bamboo, buxus, feature trees)', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:11000, total:11000, markupPercent:72.5, revenue:18975 },
    { id:'q1331-67', estimateId:'q1331-est-1', displayOrder:'15.2', category:'Soft Landscaping', description:'Machine hire', type:'Subcontractor' as const, crewType:'Subcontractor' as const, units:4, uom:'each', unitCost:150, total:600, markupPercent:47.5, revenue:885 },
    { id:'q1331-68', estimateId:'q1331-est-1', displayOrder:'15.3', category:'Soft Landscaping', description:'3 way soil blend', type:'Material' as const, crewType:'Formation' as const, units:15, uom:'m3', unitCost:125, total:1875, markupPercent:62.5, revenue:3047 },
    { id:'q1331-69', estimateId:'q1331-est-1', displayOrder:'15.4', category:'Soft Landscaping', description:'Sure crop mulch', type:'Material' as const, crewType:'Formation' as const, units:5, uom:'m3', unitCost:125, total:625, markupPercent:62.5, revenue:1016 },
    { id:'q1331-70', estimateId:'q1331-est-1', displayOrder:'15.5', category:'Soft Landscaping', description:'Shapescaper steel edging 230x2.5mm', type:'Material' as const, crewType:'Formation' as const, units:5, uom:'each', unitCost:140, total:700, markupPercent:62.5, revenue:1138 },
    { id:'q1331-71', estimateId:'q1331-est-1', displayOrder:'15.6', category:'Soft Landscaping', description:'Fertilisers & seasol', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Ea', unitCost:75, total:75, markupPercent:62.5, revenue:122 },
    { id:'q1331-72', estimateId:'q1331-est-1', displayOrder:'15.7', category:'Soft Landscaping', description:'Soil allowance', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:62.5, revenue:244 },
    { id:'q1331-73', estimateId:'q1331-est-1', displayOrder:'15.8', category:'Soft Landscaping', description:'Edging labour', type:'Labour' as const, crewType:'Formation' as const, units:24, uom:'hour', unitCost:52.5, total:1260, markupPercent:117.5, revenue:2741 },
    { id:'q1331-74', estimateId:'q1331-est-1', displayOrder:'15.9', category:'Soft Landscaping', description:'Garden bed preparation labour', type:'Labour' as const, crewType:'Formation' as const, units:48, uom:'Hour', unitCost:52.5, total:2520, markupPercent:117.5, revenue:5481 },
    { id:'q1331-75', estimateId:'q1331-est-1', displayOrder:'15.10', category:'Soft Landscaping', description:'Labour - Planting', type:'Labour' as const, crewType:'Formation' as const, units:88, uom:'Hour', unitCost:52.5, total:4620, markupPercent:117.5, revenue:10049 },
    { id:'q1331-76', estimateId:'q1331-est-1', displayOrder:'15.11', category:'Soft Landscaping', description:'Labour - Mulch/Clean', type:'Labour' as const, crewType:'Formation' as const, units:48, uom:'Hour', unitCost:52.5, total:2520, markupPercent:117.5, revenue:5481 },
    { id:'q1331-77', estimateId:'q1331-est-1', displayOrder:'15.12', category:'Soft Landscaping', description:'Machine hire', type:'Equipment' as const, crewType:'Formation' as const, units:1, uom:'Day', unitCost:350, total:350, markupPercent:62.5, revenue:569 },
    // Irrigation
    { id:'q1331-78', estimateId:'q1331-est-1', displayOrder:'16.1', category:'Irrigation', description:'Irrigation system', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:2700, total:2700, markupPercent:62.5, revenue:4388 },
    { id:'q1331-79', estimateId:'q1331-est-1', displayOrder:'16.2', category:'Irrigation', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:72, uom:'hour', unitCost:55, total:3960, markupPercent:117.5, revenue:8613 },
    // Lighting
    { id:'q1331-80', estimateId:'q1331-est-1', displayOrder:'17.1', category:'Lighting', description:'Accent lights', type:'Material' as const, crewType:'Formation' as const, units:17, uom:'ea', unitCost:130, total:2210, markupPercent:62.5, revenue:3591 },
    { id:'q1331-81', estimateId:'q1331-est-1', displayOrder:'17.2', category:'Lighting', description:'LED strip', type:'Material' as const, crewType:'Formation' as const, units:20, uom:'lm', unitCost:60, total:1200, markupPercent:62.5, revenue:1950 },
    { id:'q1331-82', estimateId:'q1331-est-1', displayOrder:'17.3', category:'Lighting', description:'Zeron single down lights', type:'Material' as const, crewType:'Formation' as const, units:9, uom:'each', unitCost:135, total:1215, markupPercent:62.5, revenue:1974 },
    { id:'q1331-83', estimateId:'q1331-est-1', displayOrder:'17.4', category:'Lighting', description:'4mm Cable', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'Roll', unitCost:200, total:400, markupPercent:62.5, revenue:650 },
    { id:'q1331-84', estimateId:'q1331-est-1', displayOrder:'17.5', category:'Lighting', description:'Heat shrinks', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:150, total:150, markupPercent:62.5, revenue:244 },
    { id:'q1331-85', estimateId:'q1331-est-1', displayOrder:'17.6', category:'Lighting', description:'Drivers', type:'Material' as const, crewType:'Formation' as const, units:3, uom:'each', unitCost:175, total:525, markupPercent:62.5, revenue:853 },
    { id:'q1331-86', estimateId:'q1331-est-1', displayOrder:'17.7', category:'Lighting', description:'Zeron mini rigid mounting channel', type:'Material' as const, crewType:'Formation' as const, units:30, uom:'lm', unitCost:5, total:150, markupPercent:62.5, revenue:244 },
    { id:'q1331-87', estimateId:'q1331-est-1', displayOrder:'17.8', category:'Lighting', description:'Corrugated conduit 20mm', type:'Material' as const, crewType:'Formation' as const, units:4, uom:'Roll', unitCost:24, total:96, markupPercent:62.5, revenue:156 },
    { id:'q1331-88', estimateId:'q1331-est-1', displayOrder:'17.9', category:'Lighting', description:'Junction boxes', type:'Material' as const, crewType:'Formation' as const, units:5, uom:'each', unitCost:5, total:25, markupPercent:62.5, revenue:41 },
    { id:'q1331-89', estimateId:'q1331-est-1', displayOrder:'17.10', category:'Lighting', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:72, uom:'hour', unitCost:55, total:3960, markupPercent:117.5, revenue:8613 },
    // Letterbox
    { id:'q1331-90', estimateId:'q1331-est-1', displayOrder:'18.1', category:'Letterbox', description:'Hamilton parcelbox', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Ea', unitCost:550, total:550, markupPercent:47.5, revenue:811 },
    { id:'q1331-91', estimateId:'q1331-est-1', displayOrder:'18.2', category:'Letterbox', description:'House numbers', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Ea', unitCost:35, total:35, markupPercent:47.5, revenue:52 },
    { id:'q1331-92', estimateId:'q1331-est-1', displayOrder:'18.3', category:'Letterbox', description:'Delivery', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Ea', unitCost:75, total:75, markupPercent:47.5, revenue:111 },
    { id:'q1331-93', estimateId:'q1331-est-1', displayOrder:'18.4', category:'Letterbox', description:'Installation labour', type:'Labour' as const, crewType:'Formation' as const, units:2, uom:'hour', unitCost:55, total:110, markupPercent:117.5, revenue:239 },
    // Agi drainage
    { id:'q1331-94', estimateId:'q1331-est-1', displayOrder:'19.1', category:'Agi drainage', description:'Stormwater pipe 90mm slotted', type:'Material' as const, crewType:'Formation' as const, units:24, uom:'lm', unitCost:9.66, total:231.84, markupPercent:62.5, revenue:377 },
    { id:'q1331-95', estimateId:'q1331-est-1', displayOrder:'19.2', category:'Agi drainage', description:'450 series pit & grate', type:'Material' as const, crewType:'Formation' as const, units:2, uom:'Ea', unitCost:125, total:250, markupPercent:62.5, revenue:406 },
    { id:'q1331-96', estimateId:'q1331-est-1', displayOrder:'19.3', category:'Agi drainage', description:'Scoria', type:'Material' as const, crewType:'Formation' as const, units:4, uom:'m3', unitCost:125, total:500, markupPercent:62.5, revenue:813 },
    { id:'q1331-97', estimateId:'q1331-est-1', displayOrder:'19.4', category:'Agi drainage', description:'Plumbing misc', type:'Material' as const, crewType:'Formation' as const, units:1, uom:'Allowance', unitCost:50, total:50, markupPercent:62.5, revenue:81 },
    { id:'q1331-98', estimateId:'q1331-est-1', displayOrder:'19.5', category:'Agi drainage', description:'Labour', type:'Labour' as const, crewType:'Formation' as const, units:32, uom:'Hour', unitCost:55, total:1760, markupPercent:117.5, revenue:3828 },
    { id:'q1331-99', estimateId:'q1331-est-1', displayOrder:'19.6', category:'Agi drainage', description:'Machine hire', type:'Equipment' as const, crewType:'Formation' as const, units:1, uom:'Day', unitCost:350, total:350, markupPercent:17.5, revenue:411 },
  ]

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)

  // Update SAMARA project contract value
  const allProjects = loadProjects()
  const pi = allProjects.findIndex(p => p.id === 'samara')
  if (pi >= 0) {
    allProjects[pi].contractValue = Math.round(totalRevenue / 1000) * 1000
    allProjects[pi].clientName = 'Paul and Ulrika Ramondetta'
    allProjects[pi].address = '16 Samara Road, Burnside VIC'
    localStorage.setItem('fg_projects', JSON.stringify(allProjects))
  }

  saveEstimate({
    id: 'q1331-est-1',
    projectId: 'samara',
    projectName: 'Samara',
    name: 'q1331 — Samara Landscape',
    version: 1,
    status: 'accepted' as const,
    defaultMarkupFormation: 62.5,
    defaultMarkupSubcontractor: 57.5,
    lineItems: items,
    notes: 'Ramondetta residence landscape works. 19 categories.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

// ── Project name migration ───────────────────────────────────────────────────
// Runs on every login to standardise project + estimate names

const NAME_MAP: Record<string, { name: string; clientName?: string; address?: string }> = {
  'samara': { name: 'Burnside \u2013 Paul Ramondetta', clientName: 'Paul and Ulrika Ramondetta', address: '16 Samara Road, Burnside VIC' },
  '5':      { name: 'Burnside \u2013 Paul Ramondetta', clientName: 'Paul and Ulrika Ramondetta', address: '16 Samara Road, Burnside VIC' },
  'serpells': { name: 'Templestowe \u2013 Tim Hockham', clientName: 'Tim Hockham', address: '165 Serpells Road, Templestowe VIC' },
  '2':        { name: 'Templestowe \u2013 Tim Hockham', clientName: 'Tim Hockham', address: '165 Serpells Road, Templestowe VIC' },
  'sidwell':  { name: 'St Kilda \u2013 Mark Davis', clientName: 'Mark and Laura Davis', address: '5 Sidwell Ave, East St Kilda VIC' },
  '4':        { name: 'St Kilda \u2013 Mark Davis', clientName: 'Mark and Laura Davis', address: '5 Sidwell Ave, East St Kilda VIC' },
  'gelbak':   { name: 'Mentone \u2013 Leon Gelbak', clientName: 'Leon and Anya Gelbak', address: '45 Beach Road, Mentone VIC' },
  'q1371':    { name: 'Sorrento \u2013 Tony Joubert', clientName: 'Jo and Tony Joubert', address: '44 Ossett St, Sorrento VIC' },
  'q1362':    { name: 'Kew \u2013 Glenn Whittenbury', clientName: 'Glenn Whittenbury & Jenny Hatzis', address: '17 Uvadale Grove, Kew VIC' },
  'q1356':    { name: 'Richmond \u2013 James Blaufelder', clientName: 'James and Haley Blaufelder', address: '3 Kent St, Richmond VIC' },
  'q1369':    { name: 'Kew \u2013 Dedic', clientName: 'Dedic Residence', address: '22 Edward St, Kew VIC' },
}

export function migrateProjectNames(): void {
  if (typeof window === 'undefined') return

  // Update projects
  const projects = loadProjects()
  let changed = false
  const updatedProjects = projects.map(p => {
    const mapping = NAME_MAP[p.id]
    if (mapping && (p.name !== mapping.name || (mapping.clientName && p.clientName !== mapping.clientName))) {
      changed = true
      const base = { ...p, name: mapping.name, clientName: mapping.clientName || p.clientName, address: mapping.address || p.address }
      if (!p.stage) {
        return { ...base, stage: (p.status === 'active' ? 'active' : 'estimating') as ProjectStage }
      }
      return base
    }
    const needsStage = !p.stage
    const needsInvoiceModel = !p.invoiceModel
    const needsProjectType = !p.projectType
    if (needsStage || needsInvoiceModel || needsProjectType) {
      changed = true
      const invoiceModel = (p.entity === 'formation' ? 'progress_claim' : 'stage_based') as 'progress_claim' | 'stage_based'
      const projectType = (p.entity === 'formation' ? 'landscape_only' : p.entity === 'lume' ? 'pool_only' : 'landscape_only') as 'landscape_only' | 'pool_only' | 'landscape_and_pool'
      const scopes = p.scopes || (projectType === 'landscape_only'
        ? [{ id: `scope-${p.id}-ls`, name: 'Landscape', entity: 'formation' as const, invoiceModel: 'progress_claim' as const }]
        : [{ id: `scope-${p.id}-pl`, name: 'Pool', entity: 'lume' as const, invoiceModel: 'stage_based' as const }])
      return {
        ...p,
        ...(needsStage ? { stage: (p.status === 'active' ? 'active' : 'estimating') as ProjectStage } : {}),
        ...(needsInvoiceModel ? { invoiceModel } : {}),
        ...(needsProjectType ? { projectType, scopes } : {}),
      }
    }
    return p
  })
  if (changed) localStorage.setItem('fg_projects', JSON.stringify(updatedProjects))

  // Update estimates projectName
  const estimates = loadEstimates()
  let estChanged = false
  const updatedEstimates = estimates.map(e => {
    const mapping = NAME_MAP[e.projectId]
    if (mapping && e.projectName !== mapping.name) {
      estChanged = true
      // Direct name replacements for known estimates
      const nameReplacements: Record<string, string> = {
        'q1266 \u2014 Serpells / Hockham Landscape': 'Templestowe \u2013 Tim Hockham',
        'q1266 \u2013 Serpells / Hockham Landscape': 'Templestowe \u2013 Tim Hockham',
        'Serpells / Hockham Landscape': 'Templestowe \u2013 Tim Hockham',
        'q1320 \u2014 Sidwell / Davis Landscape': 'St Kilda \u2013 Mark Davis',
        'q1320 \u2013 Sidwell / Davis Landscape': 'St Kilda \u2013 Mark Davis',
        'Sidwell / Davis Landscape': 'St Kilda \u2013 Mark Davis',
        'q1362 Import': 'Kew \u2013 Glenn Whittenbury',
        'Kew \u2013 Glenn Whittenbury Import': 'Kew \u2013 Glenn Whittenbury',
        'q1371 Import': 'Sorrento \u2013 Tony Joubert',
        'Sorrento \u2013 Tony Joubert Import': 'Sorrento \u2013 Tony Joubert',
        'q1356 Import': 'Richmond \u2013 James Blaufelder',
        'Richmond \u2013 James Blaufelder Import': 'Richmond \u2013 James Blaufelder',
        'q1369 Import': 'Kew \u2013 Dedic',
        'Kew \u2013 Dedic Import': 'Kew \u2013 Dedic',
        'q1243 \u2014 Gelbak Landscape & Hardscape': 'Mentone \u2013 Leon Gelbak',
        'q1243 \u2013 Gelbak Landscape & Hardscape': 'Mentone \u2013 Leon Gelbak',
        'Gelbak Landscape & Hardscape': 'Mentone \u2013 Leon Gelbak',
        'q1331 \u2014 Samara Landscape': 'Burnside \u2013 Paul Ramondetta',
        'q1331 \u2013 Samara Landscape': 'Burnside \u2013 Paul Ramondetta',
        'Samara Landscape': 'Burnside \u2013 Paul Ramondetta',
        'Joubert Residence Import': 'Sorrento \u2013 Tony Joubert',
        'Whittenbury & Hatzis Import': 'Kew \u2013 Glenn Whittenbury',
        'Blaufelder Residence Import': 'Richmond \u2013 James Blaufelder',
        'Dedic Residence Import': 'Kew \u2013 Dedic',
      }
      const finalName = nameReplacements[e.name || ''] || (e.name?.startsWith('q') && e.name?.match(/^q\d+/) ? mapping.name : e.name) || mapping.name
      return { ...e, projectName: mapping.name, name: finalName }
    }
    return e
  })
  if (estChanged) localStorage.setItem('fg_estimates', JSON.stringify(updatedEstimates))
}