// A4 PDF of the completed pre-handover walkthrough (Zero-Defect Handover / Blue Tape audit).
// Mirrors the SOP document: per-section item tables with Blue Tape notes + status/date,
// the subcontracted-tasks and plant-replacement free tables, and the supervisor sign-off.
// Server-only.

import React from 'react'
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import { HANDOVER_SECTIONS, handoverProgress, blueTapeOf, openBlueTapeCount, type HandoverChecklist, type HandoverRow } from './handoverChecklist'

Font.registerHyphenationCallback(word => [word])

const BLACK = '#1A1A1A'
const GREY = '#6B6660'
const LINE = '#C9C4BE'
const BLUE = '#1D4ED8'
const GREEN = '#1B7A3D'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: BLACK, padding: 36, paddingBottom: 48 },
  header: { borderBottomWidth: 2, borderBottomColor: BLACK, paddingBottom: 8, marginBottom: 10 },
  docType: { fontSize: 8, color: GREY, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  sub: { fontSize: 9, color: GREY, marginTop: 2 },
  philosophy: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', padding: 6, marginBottom: 10, fontSize: 8.5, color: '#1E3A8A' },
  infoRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 3 },
  infoLabel: { width: '30%', color: GREY },
  infoValue: { width: '70%' },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', backgroundColor: BLACK, color: '#FFFFFF', paddingVertical: 3, paddingHorizontal: 6 },
  sectionIntro: { fontSize: 8.5, color: GREY, marginTop: 3, marginBottom: 2 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BLACK, paddingVertical: 3, marginTop: 4 },
  thText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 4 },
  colItem: { width: '40%', paddingRight: 8 },
  colNotes: { width: '38%', paddingRight: 8 },
  colStatus: { width: '22%' },
  itemLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  itemDetail: { fontSize: 8, color: GREY, marginTop: 1 },
  noteText: { fontSize: 8.5 },
  blueTapeTag: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BLUE, textTransform: 'uppercase', marginBottom: 1 },
  statusDone: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: GREEN },
  statusOpen: { fontSize: 8.5, color: GREY },
  statusMeta: { fontSize: 7.5, color: GREY, marginTop: 1 },
  freeCol: { width: '33.3%', paddingRight: 8, fontSize: 8.5 },
  signBox: { marginTop: 16, borderWidth: 1, borderColor: LINE, padding: 10 },
  signTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  signText: { fontSize: 8.5, color: GREY, marginBottom: 8 },
  signRow: { flexDirection: 'row', marginTop: 6 },
  signCell: { width: '50%', paddingRight: 12 },
  signLine: { borderBottomWidth: 1, borderBottomColor: BLACK, height: 18, justifyContent: 'flex-end' },
  signLabel: { fontSize: 7.5, color: GREY, marginTop: 2 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: GREY },
})

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' })
}

function FreeTable({ title, headers, rows }: { title: string; headers: [string, string, string]; rows: HandoverRow[] }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.th}>
        {headers.map((h, i) => <Text key={i} style={[s.thText, s.freeCol]}>{h}</Text>)}
      </View>
      {rows.length === 0 ? (
        <View style={s.row}><Text style={[s.freeCol, { color: GREY }]}>None recorded</Text></View>
      ) : rows.map((r, i) => (
        <View key={i} style={s.row} wrap={false}>
          <Text style={s.freeCol}>{r.a}</Text>
          <Text style={s.freeCol}>{r.b}</Text>
          <Text style={s.freeCol}>{r.c}</Text>
        </View>
      ))}
    </View>
  )
}

export function HandoverPdf({ checklist, projectName, address, supervisor }: {
  checklist: HandoverChecklist; projectName: string; address: string; supervisor: string
}) {
  const { data } = checklist
  const progress = handoverProgress(data)
  const footerLeft = `Pre-Handover Walkthrough - ${projectName}`
  return (
    <Document title={`Pre-Handover Walkthrough - ${projectName}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.docType}>Internal Audit & Quality Control Protocol</Text>
          <Text style={s.title}>The Zero-Defect Handover</Text>
          <Text style={s.sub}>Pre-handover walkthrough - {progress.done} of {progress.total} items complete</Text>
        </View>

        <Text style={s.philosophy}>
          The Blue Tape philosophy: walk the site as the client will - slowly, critically, and up close.
          Anything that is not perfect gets blue tape and a note below, and is rectified before handover.
        </Text>

        <View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Project</Text><Text style={s.infoValue}>{projectName}</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Site address</Text><Text style={s.infoValue}>{address || '-'}</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Site supervisor</Text><Text style={s.infoValue}>{supervisor || '-'}</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Audit date</Text><Text style={s.infoValue}>{fmtDate(checklist.updatedAt) || '-'}</Text></View>
        </View>

        {HANDOVER_SECTIONS.map(sec => (
          <View key={sec.key} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            {sec.intro ? <Text style={s.sectionIntro}>{sec.intro}</Text> : null}
            <View style={s.th}>
              <Text style={[s.thText, s.colItem]}>Checklist item</Text>
              <Text style={[s.thText, s.colNotes]}>Notes / &quot;Blue Tape&quot; issues</Text>
              <Text style={[s.thText, s.colStatus]}>Status &amp; date</Text>
            </View>
            {sec.items.map(item => {
              const st = data.items[`${sec.key}.${item.key}`]
              return (
                <View key={item.key} style={s.row} wrap={false}>
                  <View style={s.colItem}>
                    <Text style={s.itemLabel}>{item.label}</Text>
                    <Text style={s.itemDetail}>{item.detail}</Text>
                  </View>
                  <View style={s.colNotes}>
                    {blueTapeOf(st).filter(b => b.text.trim()).length > 0 ? (
                      <View>
                        <Text style={s.blueTapeTag}>Blue tape</Text>
                        {blueTapeOf(st).filter(b => b.text.trim()).map(b => (
                          <Text key={b.id} style={[s.noteText, b.done ? { color: GREEN } : {}]}>
                            {b.done ? '[x] ' : '[  ] '}{b.text}{b.done ? ' - rectified' : ''}
                          </Text>
                        ))}
                      </View>
                    ) : <Text style={[s.noteText, { color: GREY }]}>-</Text>}
                  </View>
                  <View style={s.colStatus}>
                    {st?.done ? (
                      <View>
                        <Text style={s.statusDone}>Passed</Text>
                        <Text style={s.statusMeta}>{fmtDate(st.doneAt)}{st.doneBy ? ` - ${st.doneBy}` : ''}</Text>
                      </View>
                    ) : st?.na ? (
                      <View>
                        <Text style={s.statusOpen}>N/A</Text>
                        <Text style={s.statusMeta}>Not on this job</Text>
                      </View>
                    ) : <Text style={s.statusOpen}>Outstanding</Text>}
                  </View>
                </View>
              )
            })}
            {sec.key === 'hardscape' ? (
              <FreeTable title="Subcontracted Tasks & Specialist Works" headers={['Sub contractor / task', 'Status', 'Notes']} rows={data.subbieTasks} />
            ) : null}
            {sec.key === 'landscape' ? (
              <FreeTable title="Plant Replacement Log" headers={['Plant location', 'Species', 'Reason / status']} rows={data.plantLog} />
            ) : null}
          </View>
        ))}

        <View style={s.signBox} wrap={false}>
          <Text style={s.signTitle}>Supervisor sign-off</Text>
          <Text style={s.signText}>
            I confirm this walkthrough has been completed (all {progress.total} checklist items resolved)
            and {openBlueTapeCount(data) > 0
              ? `the ${openBlueTapeCount(data)} outstanding "Blue Tape" defect${openBlueTapeCount(data) === 1 ? '' : 's'} will be rectified within 24 hours.`
              : 'all "Blue Tape" defects have been rectified.'}
          </Text>
          <View style={s.signRow}>
            <View style={s.signCell}>
              <View style={s.signLine}><Text>{checklist.signedOffBy || ''}</Text></View>
              <Text style={s.signLabel}>Site supervisor</Text>
            </View>
            <View style={s.signCell}>
              <View style={s.signLine}><Text>{fmtDate(checklist.signedOffAt)}</Text></View>
              <Text style={s.signLabel}>Date</Text>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{footerLeft}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
