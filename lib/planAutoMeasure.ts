// Auto-measure hard-surface areas from a vector (CAD-exported) plan PDF.
//
// Landscape plans exported from AutoCAD keep named layers (OCGs) and label each hard surface with
// its material code (PAV-01, DEC-01, CON-01, …). The hatching itself is line-based (no fillable
// region), but the AREA OUTLINES live on dedicated layers ("…Pave outline", "…Boundary"). This
// extractor walks the PDF's vector operators, pulls the closed outline polygons off those layers,
// and tags each one to the nearest material-code label — so we get area-per-material automatically.
//
// Output polygons are in NORMALISED 0..1 image coordinates (PDF y-axis flipped to top-down) so they
// drop straight into a TakeoffMeasurement and reuse the existing calcArea() + scale. Absolute m² is
// NOT computed here — the user's scale calibration does that, same as a manual measurement.
//
// It is deliberately conservative: if the plan has no recognisable outline layer (a raster scan, or
// a plan drawn without the convention), it reports hadOutlineLayer=false so the UI can fall back to
// manual measuring rather than inventing numbers.

export interface AutoRegion {
  code: string                              // material code, e.g. 'PAV-02', or 'UNASSIGNED'
  points: { x: number; y: number }[]        // normalised 0..1, image space (y top-down)
}

export interface AutoMeasureResult {
  hadOutlineLayer: boolean
  regions: AutoRegion[]
}

type Mat = [number, number, number, number, number, number]

export async function extractPlanRegions(page: any, occ: any, OPS: any): Promise<AutoMeasureResult> {
  const view: number[] = page.view ?? [0, 0, page.getViewport({ scale: 1 }).width, page.getViewport({ scale: 1 }).height]
  const x0 = view[0], y0 = view[1]
  const pageW = view[2] - view[0], pageH = view[3] - view[1]
  const pageArea = pageW * pageH
  if (pageArea <= 0) return { hadOutlineLayer: false, regions: [] }

  const isOutlineLayer = (id: string): boolean => {
    let name = ''
    try { name = occ?.getGroup(id)?.name || '' } catch { /* ignore */ }
    return /outline|boundary|\bpave\b|hard\s*surface|edge|paving|deck|concrete/i.test(name)
  }

  const opList = await page.getOperatorList()
  const fns: number[] = opList.fnArray
  const args: unknown[] = opList.argsArray

  let ctm: Mat = [1, 0, 0, 1, 0, 0]
  const stack: Mat[] = []
  const det = (m: Mat) => m[0] * m[3] - m[1] * m[2]
  const mult = (m: Mat, n: Mat): Mat => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ]
  const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
  const shoelace = (p: number[]): number => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1] } return Math.abs(a) / 2 }

  const decode = (ops: number[], coords: number[]): number[][] => {
    const subs: number[][] = []; let cur: number[] = []; let ci = 0
    for (const op of ops) {
      if (op === OPS.moveTo) { if (cur.length) subs.push(cur); cur = [coords[ci++], coords[ci++]] }
      else if (op === OPS.lineTo) cur.push(coords[ci++], coords[ci++])
      else if (op === OPS.curveTo) { ci += 4; cur.push(coords[ci++], coords[ci++]) }
      else if (op === OPS.curveTo2) { ci += 2; cur.push(coords[ci++], coords[ci++]) }
      else if (op === OPS.curveTo3) { cur.push(coords[ci + 2], coords[ci + 3]); ci += 4 }
      else if (op === OPS.rectangle) { const x = coords[ci++], y = coords[ci++], w = coords[ci++], h = coords[ci++]; if (cur.length) { subs.push(cur); cur = [] } subs.push([x, y, x + w, y, x + w, y + h, x, y + h]) }
    }
    if (cur.length) subs.push(cur)
    return subs
  }

  const mc: (string | null)[] = []
  let path: number[][] = []
  let foundOutlineLayer = false
  const raw: { cx: number; cy: number; norm: { x: number; y: number }[] }[] = []

  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i]
    const a = args[i] as any
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() || ctm
    else if (fn === OPS.transform) ctm = mult([a[0], a[1], a[2], a[3], a[4], a[5]], ctm)
    else if (fn === OPS.beginMarkedContentProps) mc.push(a?.[1]?.type === 'OCG' ? a[1].id : null)
    else if (fn === OPS.beginMarkedContent) mc.push(null)
    else if (fn === OPS.endMarkedContent) mc.pop()
    else if (fn === OPS.constructPath) path = decode(a[0], a[1])
    else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.closeFillStroke) {
      let layer: string | null = null
      for (let k = mc.length - 1; k >= 0; k--) if (mc[k]) { layer = mc[k]; break }
      if (!layer || !isOutlineLayer(layer)) continue
      foundOutlineLayer = true
      const sc = Math.abs(det(ctm))
      for (const sp of path) {
        if (sp.length < 8) continue                      // need ≥4 points for a real area
        const frac = (shoelace(sp) * sc) / pageArea
        if (frac < 0.0001 || frac > 0.25) continue       // drop noise + page/container clips (scale-free)
        let cx = 0, cy = 0
        const norm: { x: number; y: number }[] = []
        for (let k = 0; k < sp.length; k += 2) {
          const [px, py] = apply(ctm, sp[k], sp[k + 1])
          cx += px; cy += py
          norm.push({ x: (px - x0) / pageW, y: 1 - (py - y0) / pageH })   // flip y → image space
        }
        const n = sp.length / 2
        raw.push({ cx: cx / n, cy: cy / n, norm })
      }
    }
  }

  // Material-code labels (matched in PDF user space, same as region centres above).
  const tc = await page.getTextContent()
  const labels: { code: string; x: number; y: number }[] = []
  for (const it of tc.items) {
    const s = String(it.str || '').trim()
    const m = s.match(/\b(PAV|DEC|CON|PT|STN|TIM|GRV)\s*-?\s*(\d{1,2})\b/i)
    if (m && it.transform) labels.push({ code: `${m[1].toUpperCase()}-${m[2].padStart(2, '0')}`, x: it.transform[4], y: it.transform[5] })
  }
  // Drop the material-palette legend (a row of codes low on the sheet) when there are plan labels too.
  const planLabels = labels.filter(l => (l.y - y0) / pageH > 0.25)
  const useLabels = planLabels.length ? planLabels : labels

  const nearest = (cx: number, cy: number): string => {
    let best = 'UNASSIGNED', bd = Infinity
    for (const l of useLabels) { const d = Math.hypot(l.x - cx, l.y - cy); if (d < bd) { bd = d; best = l.code } }
    return best
  }

  return {
    hadOutlineLayer: foundOutlineLayer,
    regions: raw.map(r => ({ code: nearest(r.cx, r.cy), points: r.norm })),
  }
}
