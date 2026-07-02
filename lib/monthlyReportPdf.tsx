// The foreman's monthly management-meeting report - one A4 PDF covering every project they run:
// what happened last month, what's planned next month, and planned-vs-actual tracking. Built for
// the monthly meeting: no profit or revenue anywhere (same rule as the cockpit). Server-only.

import React from 'react'
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'

Font.registerHyphenationCallback(word => [word])

export interface ReportScopeLine { category: string; label: string; start: string; end: string; donePct: number }
export interface ReportUpcoming { category: string; label: string; start: string; end: string }
export interface ReportSlip { category: string; days: number }
export interface ReportVariation { number: number; reason: string; amount: number; status: string }

export interface ProjectReport {
  name: string
  address: string
  status: string
  progressPct: number            // blended schedule progress 0..1
  score: number | null
  scoreLabel: string
  scheduleNote: string           // timeline vs the ORIGINAL baseline (creep penalty breakdown)
  levers: { label: string; used: string; base: string }[]   // pre-formatted (hours / $ / committed)
  forecastEnd: string
  plannedEnd: string
  slipDays: number | null        // + = behind
  hoursLastMonth: number
  doneLines: ReportScopeLine[]
  upcoming: ReportUpcoming[]
  slips: ReportSlip[]
  baselineSet: boolean
  toolboxCount: number
  incidentCount: number
  inductionCount: number
  variations: ReportVariation[]
}

export interface MonthlyReport {
  foreman: string
  generatedAt: string
  doneWindow: { from: string; to: string }
  planWindow: { from: string; to: string }
  projects: ProjectReport[]
}

const BLACK = '#1A1A1A'
const GREY = '#6B6660'
const LINE = '#C9C4BE'
const GREEN = '#3D5A3A'
const AMBER = '#B45309'
const RED = '#C8102E'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: BLACK, padding: 36, paddingBottom: 48 },
  header: { borderBottomWidth: 2, borderBottomColor: BLACK, paddingBottom: 8, marginBottom: 12 },
  docType: { fontSize: 8, color: GREY, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  sub: { fontSize: 9, color: GREY, marginTop: 2 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', backgroundColor: BLACK, color: '#FFFFFF', paddingVertical: 3, paddingHorizontal: 6, marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 3 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  stat: { width: '25%', paddingVertical: 4, paddingRight: 8 },
  statLabel: { fontSize: 7.5, color: GREY, textTransform: 'uppercase' },
  statValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  note: { fontSize: 8, color: GREY, marginTop: 3 },
})

const fmtD = (iso: string) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '-'

function Footer({ left }: { left: string }) {
  return (
    <View style={{ position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between' }} fixed>
      <Text style={{ fontSize: 7.5, color: GREY }}>{left}</Text>
      <Text style={{ fontSize: 7.5, color: GREY }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}

export function MonthlyReportPdf({ report }: { report: MonthlyReport }) {
  const win = report
  return (
    <Document title={`Monthly report - ${report.foreman}`}>
      {report.projects.map((p, pi) => (
        <Page key={pi} size="A4" style={s.page}>
          <View style={s.header}>
            <Text style={s.docType}>Monthly site report {'·'} {report.foreman} {'·'} generated {fmtD(report.generatedAt)}</Text>
            <Text style={s.title}>{p.name}</Text>
            <Text style={s.sub}>{p.address}{p.address ? ' · ' : ''}{p.status}</Text>
          </View>

          {/* Tracking snapshot */}
          <Text style={s.sectionTitle}>Tracking - planned vs actual</Text>
          <View style={s.statGrid}>
            <View style={s.stat}>
              <Text style={s.statLabel}>Job progress</Text>
              <Text style={s.statValue}>{Math.round(p.progressPct * 100)}%</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Score (target 100)</Text>
              <Text style={[s.statValue, { color: p.score !== null && p.score >= 100 ? GREEN : p.score !== null && p.score >= 88 ? AMBER : p.score === null ? GREY : RED }]}>
                {p.score === null ? '-' : p.score} {p.score !== null ? `· ${p.scoreLabel}` : ''}
              </Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Tracking to</Text>
              <Text style={s.statValue}>{fmtD(p.forecastEnd)}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>{p.plannedEnd ? `Planned ${fmtD(p.plannedEnd)}` : 'Planned finish'}</Text>
              <Text style={[s.statValue, { color: p.slipDays === null ? GREY : p.slipDays > 2 ? RED : p.slipDays > 0 ? AMBER : GREEN }]}>
                {p.slipDays === null ? '-' : p.slipDays > 0 ? `${p.slipDays}d behind` : p.slipDays < 0 ? `${-p.slipDays}d ahead` : 'On plan'}
              </Text>
            </View>
          </View>
          <View style={s.row}>
            <Text style={{ width: '30%', color: GREY }}>Timeline vs original plan</Text>
            <Text style={{ width: '70%', color: /penalty/.test(p.scheduleNote) ? RED : /No baseline/.test(p.scheduleNote) ? GREY : GREEN }}>{p.scheduleNote}</Text>
          </View>
          {p.levers.map((l, i) => (
            <View key={i} style={s.row}>
              <Text style={{ width: '30%', color: GREY }}>{l.label}</Text>
              <Text style={{ width: '70%' }}>{l.used}{l.base ? `  ·  ${l.base}` : ''}</Text>
            </View>
          ))}
          {p.slips.length > 0 ? (
            <>
              <Text style={[s.note, { marginTop: 6, fontFamily: 'Helvetica-Bold', color: BLACK }]}>Categories running late vs baseline:</Text>
              {p.slips.map((sl, i) => (
                <View key={i} style={s.row}>
                  <Text style={{ width: '70%' }}>{sl.category}</Text>
                  <Text style={{ width: '30%', color: sl.days > 5 ? RED : AMBER }}>+{sl.days} days</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={s.note}>{p.baselineSet ? 'No categories behind baseline.' : 'No baseline set - slip vs plan unavailable (set one on the office gantt).'}</Text>
          )}

          {/* Last month */}
          <Text style={s.sectionTitle}>Done - {fmtD(win.doneWindow.from)} to {fmtD(win.doneWindow.to)}</Text>
          {p.doneLines.length === 0 ? (
            <Text style={s.note}>No scheduled work in this window.</Text>
          ) : p.doneLines.map((d, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={{ width: '46%' }}>{d.category}</Text>
              <Text style={{ width: '18%', color: GREY }}>{d.label}</Text>
              <Text style={{ width: '24%', color: GREY }}>{fmtD(d.start)} - {fmtD(d.end)}</Text>
              <Text style={{ width: '12%', textAlign: 'right' }}>{Math.round(d.donePct * 100)}%</Text>
            </View>
          ))}
          <View style={s.statGrid}>
            <View style={s.stat}>
              <Text style={s.statLabel}>Crew hours (window)</Text>
              <Text style={s.statValue}>{Math.round(p.hoursLastMonth)}h</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Toolbox talks</Text>
              <Text style={s.statValue}>{p.toolboxCount}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Incidents</Text>
              <Text style={[s.statValue, { color: p.incidentCount > 0 ? RED : BLACK }]}>{p.incidentCount}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Inducted on site</Text>
              <Text style={s.statValue}>{p.inductionCount}</Text>
            </View>
          </View>
          {p.variations.length > 0 && (
            <>
              <Text style={[s.note, { fontFamily: 'Helvetica-Bold', color: BLACK }]}>Variations raised:</Text>
              {p.variations.map((v, i) => (
                <View key={i} style={s.row}>
                  <Text style={{ width: '12%' }}>VMO-{v.number}</Text>
                  <Text style={{ width: '58%' }}>{v.reason}</Text>
                  <Text style={{ width: '15%', textAlign: 'right' }}>${v.amount.toLocaleString('en-AU')}</Text>
                  <Text style={{ width: '15%', textAlign: 'right', color: v.status === 'accepted' ? GREEN : v.status === 'declined' ? GREY : AMBER }}>
                    {v.status === 'accepted' ? 'approved' : v.status === 'declined' ? 'declined' : 'pending'}
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Next month */}
          <Text style={s.sectionTitle}>Plan - {fmtD(win.planWindow.from)} to {fmtD(win.planWindow.to)}</Text>
          {p.upcoming.length === 0 ? (
            <Text style={s.note}>Nothing scheduled in this window.</Text>
          ) : p.upcoming.map((u, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={{ width: '50%' }}>{u.category}</Text>
              <Text style={{ width: '20%', color: GREY }}>{u.label}</Text>
              <Text style={{ width: '30%', color: GREY }}>{fmtD(u.start)} - {fmtD(u.end)}</Text>
            </View>
          ))}

          <Footer left={`Monthly site report · ${report.foreman} · ${p.name}`} />
        </Page>
      ))}
    </Document>
  )
}
