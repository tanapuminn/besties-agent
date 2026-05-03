import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { submitJuryScore } from '../lib/api.js'

const CRITERIA = [
  { key: 'businessImpact',    label: 'Business Impact',    desc: 'ผลกระทบทางธุรกิจและความคุ้มค่า',       weight: 0.30 },
  { key: 'aiFit',             label: 'AI Fit',             desc: 'ความเหมาะสมในการนำ AI มาแก้ปัญหา',    weight: 0.20 },
  { key: 'dataFeasibility',   label: 'Data Feasibility',   desc: 'ความพร้อมและความเป็นไปได้ของข้อมูล',  weight: 0.20 },
  { key: 'workflowAdoption',  label: 'Workflow Adoption',  desc: 'โอกาสที่ผู้ใช้จะยอมรับและใช้งาน',    weight: 0.20 },
  { key: 'riskScalability',   label: 'Risk & Scalability', desc: 'ความเสี่ยงและศักยภาพในการขยายระบบ',   weight: 0.10 },
]

const css = `
  .jury-root {
    min-height: 100vh; background: #0A120C; color: #fff;
    font-family: 'Sarabun', sans-serif; padding: 0 0 4rem;
  }
  .jury-header {
    background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.1);
    padding: 1rem 1.25rem; display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 10;
  }
  .jury-header img { width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgba(245,196,0,0.4); object-fit: cover; object-position: center 10%; }
  .jury-header-title { font-size: 15px; font-weight: 700; }
  .jury-header-sub   { font-size: 11px; color: rgba(255,255,255,0.4); }
  .jury-body { max-width: 480px; margin: 0 auto; padding: 1.5rem 1.25rem; }

  .jury-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 1.25rem; margin-bottom: 1rem; }
  .jury-card-title { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 1rem; }

  .jury-field-label { font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 6px; margin-top: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .jury-field-label:first-child { margin-top: 0; }
  .jury-input {
    width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
    padding: 10px 14px; font-size: 14px; font-family: 'Sarabun', sans-serif; color: #fff; outline: none;
  }
  .jury-input:focus { border-color: #F5C400; }
  .jury-input::placeholder { color: rgba(255,255,255,0.25); }
  .jury-save-btn {
    width: 100%; margin-top: 1rem; background: #F5C400; border: none; border-radius: 10px;
    padding: 10px; font-size: 14px; font-family: 'Sarabun', sans-serif; font-weight: 700;
    color: #1A1A1A; cursor: pointer; transition: background 0.2s;
  }
  .jury-save-btn:hover { background: #A07800; color: #fff; }

  .jury-criteria-item { margin-bottom: 1.25rem; }
  .jury-criteria-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
  .jury-criteria-name { font-size: 15px; font-weight: 700; }
  .jury-criteria-weight { font-size: 11px; color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 20px; }
  .jury-criteria-desc { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 8px; }
  .jury-score-row { display: flex; align-items: center; gap: 10px; }
  .jury-slider { flex: 1; appearance: none; height: 6px; border-radius: 3px; outline: none; cursor: pointer; }
  .jury-slider::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #F5C400; cursor: pointer; }
  .jury-score-num { font-size: 22px; font-weight: 800; color: #F5C400; min-width: 28px; text-align: right; }

  .jury-total-card { background: linear-gradient(145deg, rgba(245,196,0,0.1), rgba(45,122,58,0.1)); border: 1px solid rgba(245,196,0,0.3); border-radius: 16px; padding: 1.5rem; text-align: center; margin-bottom: 1rem; }
  .jury-total-num { font-size: 56px; font-weight: 800; line-height: 1; }
  .jury-total-label { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }

  .jury-textarea {
    width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
    padding: 10px 14px; font-size: 14px; font-family: 'Sarabun', sans-serif; color: #fff; outline: none;
    resize: vertical; min-height: 80px;
  }
  .jury-textarea:focus { border-color: #F5C400; }
  .jury-submit-btn {
    width: 100%; background: #2D7A3A; border: none; border-radius: 12px;
    padding: 14px; font-size: 16px; font-family: 'Sarabun', sans-serif; font-weight: 700;
    color: #fff; cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px;
  }
  .jury-submit-btn:hover:not(:disabled) { background: #1e5428; }
  .jury-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .jury-success { text-align: center; padding: 3rem 1.25rem; }
  .jury-success-icon { font-size: 72px; }
  .jury-success-title { font-size: 24px; font-weight: 800; margin-top: 1rem; }
  .jury-success-sub { font-size: 14px; color: rgba(255,255,255,0.5); margin-top: 0.5rem; }
  .jury-success-btn {
    margin-top: 2rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px; padding: 12px 24px; font-size: 14px; font-family: 'Sarabun', sans-serif;
    color: rgba(255,255,255,0.8); cursor: pointer; transition: all 0.2s;
  }
  .jury-success-btn:hover { background: rgba(255,255,255,0.15); }

  .jury-error { color: #EF4444; font-size: 13px; margin-top: 8px; }
`

const INIT_SCORES = Object.fromEntries(CRITERIA.map(c => [c.key, 7]))

function calcWeighted(scores) {
  return Math.round(CRITERIA.reduce((sum, c) => sum + (scores[c.key] || 0) * c.weight * 10, 0))
}

function sliderBackground(val) {
  const pct = (val / 10) * 100
  return `linear-gradient(to right, #F5C400 ${pct}%, rgba(255,255,255,0.12) ${pct}%)`
}

export default function JuryPage() {
  const [searchParams] = useSearchParams()

  const [setup, setSetup] = useState({
    n8nUrl:    localStorage.getItem('jury_n8n_url')   || localStorage.getItem('n8n_webhook') || '',
    sessionId: searchParams.get('session') || localStorage.getItem('jury_session') || '',
    judgeName: localStorage.getItem('jury_judge_name') || '',
    teamName:  searchParams.get('team')    || '',
  })
  const [setupSaved, setSetupSaved] = useState(false)

  const [scores, setScores]   = useState({ ...INIT_SCORES })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (setup.sessionId) localStorage.setItem('jury_session', setup.sessionId)
    if (setup.judgeName) localStorage.setItem('jury_judge_name', setup.judgeName)
    if (setup.n8nUrl)    { localStorage.setItem('jury_n8n_url', setup.n8nUrl); localStorage.setItem('n8n_webhook', setup.n8nUrl) }
  }, [setup])

  function saveSetup() {
    if (!setup.n8nUrl || !setup.sessionId || !setup.judgeName) { setError('กรุณากรอกข้อมูลให้ครบ'); return }
    setError('')
    setSetupSaved(true)
  }

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    const weighted = calcWeighted(scores)
    try {
      await submitJuryScore({
        session: setup.sessionId,
        judgeName: setup.judgeName,
        ...scores,
        comment,
        weightedScore: weighted,
      })
      setSubmitted(true)
    } catch (e) {
      setError('ส่งคะแนนไม่สำเร็จ: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function nextTeam() {
    setSetup(s => ({ ...s, sessionId: '', teamName: '' }))
    setScores({ ...INIT_SCORES })
    setComment('')
    setError('')
    setSubmitted(false)
    setSetupSaved(false)
  }

  if (submitted) {
    return (
      <>
        <style>{css}</style>
        <div className="jury-root">
          <div className="jury-header">
            <img src="/Besties.png" alt="" onError={e => (e.target.style.display = 'none')} />
            <div>
              <div className="jury-header-title">Besties AI</div>
              <div className="jury-header-sub">Jury Scoring</div>
            </div>
          </div>
          <div className="jury-body">
            <div className="jury-success">
              <div className="jury-success-icon">✅</div>
              <div className="jury-success-title">ส่งคะแนนสำเร็จ!</div>
              <div className="jury-success-sub">คะแนนของ {setup.judgeName} ถูกบันทึกเรียบร้อยแล้ว</div>
              <button className="jury-success-btn" onClick={nextTeam}>ประเมินทีมถัดไป →</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (!setupSaved) {
    return (
      <>
        <style>{css}</style>
        <div className="jury-root">
          <div className="jury-header">
            <img src="/Besties.png" alt="" onError={e => (e.target.style.display = 'none')} />
            <div>
              <div className="jury-header-title">Besties AI</div>
              <div className="jury-header-sub">Jury Scoring</div>
            </div>
          </div>
          <div className="jury-body">
            <div className="jury-card">
              <div className="jury-card-title">ตั้งค่าเริ่มต้น</div>
              <div className="jury-field-label">N8N Webhook URL</div>
              <input className="jury-input" placeholder="http://your-n8n:5678/webhook" value={setup.n8nUrl} onChange={e => setSetup(s => ({ ...s, n8nUrl: e.target.value }))} />
              <div className="jury-field-label">Session ID</div>
              <input className="jury-input" placeholder="SESSION-1234" value={setup.sessionId} onChange={e => setSetup(s => ({ ...s, sessionId: e.target.value }))} />
              <div className="jury-field-label">ชื่อกรรมการ</div>
              <input className="jury-input" placeholder="ชื่อ-นามสกุล" value={setup.judgeName} onChange={e => setSetup(s => ({ ...s, judgeName: e.target.value }))} />
              {error && <div className="jury-error">{error}</div>}
              <button className="jury-save-btn" onClick={saveSetup}>เริ่มให้คะแนน →</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  const weighted = calcWeighted(scores)
  const scoreColor = weighted >= 80 ? '#4CAF50' : weighted >= 60 ? '#F5C400' : '#F97316'

  return (
    <>
      <style>{css}</style>
      <div className="jury-root">
        <div className="jury-header">
          <img src="/Besties.png" alt="" onError={e => (e.target.style.display = 'none')} />
          <div>
            <div className="jury-header-title">Besties AI</div>
            <div className="jury-header-sub">{setup.judgeName} • {setup.sessionId}</div>
          </div>
        </div>
        <div className="jury-body">
          {setup.teamName && (
            <div style={{ background: 'rgba(245,196,0,0.08)', border: '1px solid rgba(245,196,0,0.25)', borderRadius: 12, padding: '10px 16px', marginBottom: '1rem', fontSize: 15, fontWeight: 700, color: '#F5C400' }}>
              ทีม: {setup.teamName}
            </div>
          )}

          <div className="jury-total-card">
            <div className="jury-total-num" style={{ color: scoreColor }}>{weighted}</div>
            <div className="jury-total-label">/ 100 คะแนน (weighted)</div>
          </div>

          <div className="jury-card">
            <div className="jury-card-title">เกณฑ์การให้คะแนน</div>
            {CRITERIA.map(c => (
              <div className="jury-criteria-item" key={c.key}>
                <div className="jury-criteria-header">
                  <span className="jury-criteria-name">{c.label}</span>
                  <span className="jury-criteria-weight">weight {Math.round(c.weight * 100)}%</span>
                </div>
                <div className="jury-criteria-desc">{c.desc}</div>
                <div className="jury-score-row">
                  <input
                    type="range" min={0} max={10} step={1}
                    className="jury-slider"
                    value={scores[c.key]}
                    style={{ background: sliderBackground(scores[c.key]) }}
                    onChange={e => setScores(s => ({ ...s, [c.key]: Number(e.target.value) }))}
                  />
                  <span className="jury-score-num">{scores[c.key]}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="jury-card">
            <div className="jury-card-title">ความเห็นเพิ่มเติม</div>
            <textarea className="jury-textarea" placeholder="ความเห็น คำแนะนำ..." value={comment} onChange={e => setComment(e.target.value)} />
          </div>

          {error && <div className="jury-error" style={{ marginBottom: 8 }}>{error}</div>}

          <button className="jury-submit-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'กำลังส่ง...' : `✅ ส่งคะแนน ${weighted} คะแนน`}
          </button>

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button onClick={() => { setSetupSaved(false); setError('') }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer' }}>
              แก้ไขข้อมูลกรรมการ
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
