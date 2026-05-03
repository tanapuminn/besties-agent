function getBase() {
  const wh = localStorage.getItem('n8n_webhook') || ''
  return wh.replace(/\/$/, '').replace(/\/(besties-[^/]+)$/, '') || null
}

export async function saveKBEntry(payload) {
  const base = getBase()
  if (!base) return
  await fetch(`${base}/besties-kb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

export async function fetchKBContext(sessionId, limit = 20) {
  const base = getBase()
  if (!base) return null
  try {
    const res = await fetch(`${base}/besties-kb?session=${sessionId}&limit=${limit}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.contextText || null
  } catch (_) { return null }
}

export async function registerSession(sessionId, teamName) {
  const base = getBase()
  if (!base) return
  await fetch(`${base}/besties-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: sessionId, teamName }),
  }).catch(() => {})
}

export async function fetchSessions() {
  const base = getBase()
  if (!base) throw new Error('ยังไม่ได้ตั้งค่า N8N URL')
  const res = await fetch(`${base}/besties-sessions`)
  const data = await res.json()
  return data.sessions || []
}

export async function analyzeViaN8N(sessionId, teamName, apiKey) {
  const base = getBase()
  if (!base) throw new Error('ยังไม่ได้ตั้งค่า N8N URL')
  const res = await fetch(`${base}/besties-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: sessionId, teamName, apiKey }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchJuryScores(sessionId) {
  const base = getBase()
  if (!base) return ''
  try {
    const res = await fetch(`${base}/besties-jury?session=${encodeURIComponent(sessionId)}`)
    if (!res.ok) return ''
    const data = await res.json()
    const judges = data.judges || data.rows || []
    if (!judges.length) return ''
    let ctx = '\n\n[คะแนนจากกรรมการทั้งหมด]\n'
    judges.forEach((j, i) => {
      const name = j.name || j.judge_name || `กรรมการ ${i + 1}`
      ctx += `\n${name}:\n`
      const fields = {
        'Business Impact': j.business_impact ?? j.businessImpact,
        'AI Fit': j.ai_fit ?? j.aiFit,
        'Feasibility': j.feasibility,
        'Adoption': j.adoption,
        'Risk': j.risk,
      }
      Object.entries(fields).forEach(([k, v]) => {
        if (v !== undefined && v !== null) ctx += `  - ${k}: ${v}/10\n`
      })
      const total = j.total ?? j.total_score
      if (total !== undefined) ctx += `  คะแนนรวม: ${total}/50\n`
      const comment = j.comment || j.feedback || j.comments
      if (comment) ctx += `  ความเห็น: ${comment}\n`
    })
    if (data.averages || data.summary) {
      const avg = data.averages || data.summary
      ctx += `\nค่าเฉลี่ยรวมทุกกรรมการ: ${avg.total ?? avg.avg_total ?? '—'}/50\n`
    }
    return ctx
  } catch (_) { return '' }
}

export async function submitJuryScore(payload) {
  const base = getBase() || localStorage.getItem('jury_n8n_url') || ''
  if (!base) throw new Error('ยังไม่ได้ตั้งค่า N8N URL')
  const res = await fetch(`${base}/besties-jury`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
