// A4 PDFs for the safety docs: SWMS (activity, HRCW, hazards/controls by hierarchy, PPE, tasks,
// acknowledgements) and SSSP (questionnaire rendered by group). Server-only.

import React from 'react'
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import type { Swms, SwmsAck, Sssp } from './safetyDocs'
import type { SsspSchema, SsspField } from './safetyContent'
import { ENTITY_LABEL } from './safety'

Font.registerHyphenationCallback(word => [word])

const RED = '#C8102E'
const BLACK = '#1A1A1A'
const GREY = '#6B6660'
const LINE = '#C9C4BE'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: BLACK, padding: 36, paddingBottom: 48 },
  header: { borderBottomWidth: 2, borderBottomColor: BLACK, paddingBottom: 8, marginBottom: 12 },
  docType: { fontSize: 8, color: GREY, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  sub: { fontSize: 9, color: GREY, marginTop: 2 },
  warn: { backgroundColor: '#FDF3D7', borderWidth: 1, borderColor: '#E0A800', padding: 6, marginBottom: 10, fontSize: 8, color: '#7A5C00' },
  section: { marginTop: 10 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', backgroundColor: BLACK, color: '#FFFFFF', paddingVertical: 3, paddingHorizontal: 6, marginBottom: 4 },
  hazard: { borderWidth: 1, borderColor: LINE, marginBottom: 6, padding: 6 },
  hazardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  hazardRisk: { fontSize: 8.5, color: GREY, marginTop: 1 },
  sevPill: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: RED, textTransform: 'uppercase' },
  control: { flexDirection: 'row', marginTop: 2, paddingLeft: 8 },
  hoc: { width: 64, fontSize: 7.5, color: GREY, textTransform: 'uppercase' },
  controlText: { flex: 1, fontSize: 8.5 },
  li: { flexDirection: 'row', marginBottom: 2 },
  liBullet: { width: 12 },
  liText: { flex: 1 },
  ackRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 3 },
  qaRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 3 },
  qaLabel: { width: '45%', color: GREY, paddingRight: 8 },
  qaValue: { width: '55%' },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: GREY },
})

const HOC_LABEL: Record<number, string> = { 1: 'Eliminate', 2: 'Substitute', 3: 'Engineering', 4: 'Admin', 5: 'PPE' }

function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}

export function SwmsPdf({ swms, acks, projectName, entity, address }: {
  swms: Swms; acks: SwmsAck[]; projectName: string; entity: 'formation' | 'lume'; address: string
}) {
  const c = swms.content
  const approved = c._meta?.approved_for_site_use === true
  return (
    <Document title={`SWMS - ${swms.activityName}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.docType}>Safe Work Method Statement {'·'} {ENTITY_LABEL[entity]}</Text>
          <Text style={s.title}>{swms.activityName}</Text>
          <Text style={s.sub}>{projectName}{address ? ` · ${address}` : ''} · Created {new Date(swms.createdAt).toLocaleDateString('en-AU')}</Text>
        </View>
        {!approved && (
          <Text style={s.warn}>
            DRAFT - this SWMS is AI-drafted v0 content and has not yet been reviewed by a qualified
            WHS practitioner. Do not rely on it for site use until reviewed and approved.
          </Text>
        )}

        {c.high_risk_categories?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>High Risk Construction Work</Text>
            {c.high_risk_categories.map((h, i) => (
              <View key={i} style={s.li}><Text style={s.liBullet}>{'•'}</Text><Text style={s.liText}>{h.replace(/_/g, ' ')}</Text></View>
            ))}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Hazards and Controls</Text>
          {c.hazards?.map((h, i) => (
            <View key={i} style={s.hazard} wrap={false}>
              <Text style={s.hazardTitle}>{h.title} {h.default_severity ? <Text style={s.sevPill}>  {h.default_severity}</Text> : null}</Text>
              {h.risk ? <Text style={s.hazardRisk}>{h.risk}</Text> : null}
              {h.controls?.map((ct, j) => (
                <View key={j} style={s.control}>
                  <Text style={s.hoc}>{HOC_LABEL[ct.hoc_level] || `HoC ${ct.hoc_level}`}</Text>
                  <Text style={s.controlText}>{ct.title}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {c.ppe?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>PPE Required</Text>
            {c.ppe.map((p, i) => (
              <View key={i} style={s.li}><Text style={s.liBullet}>{'•'}</Text><Text style={s.liText}>{p.title}</Text></View>
            ))}
          </View>
        )}

        {c.tasks?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Work Method / Task Sequence</Text>
            {c.tasks.map((t, i) => (
              <View key={i} style={s.li}><Text style={s.liBullet}>{i + 1}.</Text><Text style={s.liText}>{t}</Text></View>
            ))}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Acknowledgements</Text>
          {acks.length === 0 ? (
            <Text style={{ color: GREY }}>No acknowledgements recorded yet.</Text>
          ) : acks.map(a => (
            <View key={a.id} style={s.ackRow}>
              <Text style={{ width: '40%' }}>{a.personName}</Text>
              <Text style={{ width: '35%', color: GREY }}>{a.company}</Text>
              <Text style={{ width: '25%', color: GREY }}>{new Date(a.acceptedAt).toLocaleDateString('en-AU')}</Text>
            </View>
          ))}
        </View>

        <Footer left={`SWMS · ${swms.activityName} · ${projectName}`} />
      </Page>
    </Document>
  )
}

function answerToText(field: SsspField, v: unknown): string {
  if (v == null || v === '') return '-'
  if (field.type === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) {
    if (field.type === 'table') {
      const cols = field.columns || []
      return (v as Record<string, unknown>[]).map(row => cols.map(c => `${row[c.key] ?? ''}`).join(' / ')).join('\n')
    }
    return v.map(x => `${x}`).join(', ')
  }
  return `${v}`
}

export function SsspPdf({ sssp, schema, projectName, address }: {
  sssp: Sssp; schema: SsspSchema; projectName: string; address: string
}) {
  return (
    <Document title={`SSSP v${sssp.version} - ${projectName}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.docType}>{schema.title} {'·'} {schema.brandName}</Text>
          <Text style={s.title}>{projectName}</Text>
          <Text style={s.sub}>{address ? `${address} · ` : ''}Version {sssp.version} · {new Date(sssp.createdAt).toLocaleDateString('en-AU')}</Text>
        </View>
        {schema.groups.map(g => (
          <View key={g.id} style={s.section}>
            <Text style={s.sectionTitle}>{g.title}</Text>
            {g.fields.map(f => (
              <View key={f.key} style={s.qaRow} wrap={false}>
                <Text style={s.qaLabel}>{f.label}</Text>
                <Text style={s.qaValue}>{answerToText(f, sssp.answers[f.key])}</Text>
              </View>
            ))}
          </View>
        ))}
        <Footer left={`SSSP v${sssp.version} · ${projectName}`} />
      </Page>
    </Document>
  )
}
