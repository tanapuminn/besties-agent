import { useState, useEffect, useRef, useCallback } from 'react'
import { useChannel } from '../hooks/useChannel.js'

const CIRC = 2 * Math.PI * 52

const css = `
  :root {
    --yellow: #F5C400; --yellow-light: #FEF9E7; --yellow-dark: #A07800;
    --green: #2D7A3A; --bg: #0A120C;
    --surface: rgba(255,255,255,0.05); --border: rgba(255,255,255,0.1);
  }
  .dp-root {
    position: relative; z-index: 1; height: 100vh; width: 100vw;
    display: grid; grid-template-rows: auto 1fr auto;
    padding: 2rem 3rem; gap: 1rem; overflow: hidden;
    font-family: 'Sarabun', sans-serif; color: #fff;
    background: var(--bg);
  }
  .dp-bg-rings { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -55%); pointer-events: none; z-index: 0; }
  .dp-ring { position: absolute; border-radius: 50%; border: 1px solid rgba(245,196,0,0.07); top: 50%; left: 50%; transform: translate(-50%,-50%); }
  .dp-ring-1 { width: 480px; height: 480px; }
  .dp-ring-2 { width: 640px; height: 640px; border-color: rgba(245,196,0,0.04); }
  .dp-ring-3 { width: 820px; height: 820px; border-color: rgba(245,196,0,0.025); }

  /* TOP BAR */
  .dp-top { display: flex; align-items: center; justify-content: space-between; }
  .dp-logo { display: flex; align-items: center; gap: 10px; }
  .dp-logo img { width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(245,196,0,0.4); object-fit: cover; object-position: center 10%; }
  .dp-logo-name { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
  .dp-logo-sub { font-size: 11px; color: rgba(255,255,255,0.4); }
  .dp-team-chip { display: flex; align-items: center; gap: 10px; background: rgba(245,196,0,0.1); border: 1px solid rgba(245,196,0,0.3); padding: 8px 18px; border-radius: 30px; }
  .dp-team-label { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; }
  .dp-team-name { font-size: 18px; font-weight: 700; color: var(--yellow); text-align: center; }
  .dp-session-chip { font-size: 11px; color: rgba(255,255,255,0.3); background: var(--surface); border: 1px solid var(--border); padding: 6px 14px; border-radius: 20px; font-weight: 600; letter-spacing: 0.6px; }

  /* CENTER */
  .dp-center { position: relative; display: flex; align-items: center; justify-content: center; }
  .dp-avatar-col { display: flex; flex-direction: column; align-items: center; gap: 1rem; position: relative; }
  .dp-avatar-glow { position: absolute; width: 340px; height: 340px; background: radial-gradient(circle, rgba(245,196,0,0.12) 0%, transparent 70%); border-radius: 50%; pointer-events: none; top: 50%; left: 50%; transform: translate(-50%,-55%); }
  .dp-avatar-wrap { position: relative; width: 300px; height: 300px; border-radius: 50%; overflow: hidden; border: 3px solid rgba(245,196,0,0.3); background: rgba(255,255,255,0.04); transition: border-color 0.3s; }
  .dp-avatar-wrap img { width: 100%; height: 100%; object-fit: cover; object-position: center 10%; display: block; }
  .dp-avatar-wrap.speaking { border-color: var(--yellow); animation: dp-ring-pulse 0.7s ease-in-out infinite alternate; }
  @keyframes dp-ring-pulse { from { box-shadow: 0 0 0 0 rgba(245,196,0,0.4); border-color: rgba(245,196,0,0.6); } to { box-shadow: 0 0 0 18px rgba(245,196,0,0); border-color: var(--yellow); } }
  .dp-avatar-wrap.gesture-bounce { animation: dp-bounce 0.5s ease !important; }
  .dp-avatar-wrap.gesture-shake  { animation: dp-shake 0.5s ease !important; }
  .dp-avatar-wrap.gesture-pulse  { animation: dp-pulse 0.6s ease !important; }
  @keyframes dp-bounce { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-14px)} 60%{transform:translateY(-6px)} }
  @keyframes dp-shake  { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-6deg)} 40%{transform:rotate(6deg)} 60%{transform:rotate(-4deg)} 80%{transform:rotate(4deg)} }
  @keyframes dp-pulse  { 0%,100%{transform:scale(1)} 40%{transform:scale(1.08)} 70%{transform:scale(0.96)} }
  .dp-mouth { position: absolute; top: 45%; left: 50%; transform: translateX(-50%); width: 32px; height: 14px; z-index: 2; pointer-events: none; }
  .dp-mouth::before { content: ''; position: absolute; width: 100%; height: 100%; background: #2a1a1a; border-radius: 0 0 50% 50% / 0 0 100% 100%; box-shadow: inset 0 -3px 8px rgba(0,0,0,0.4); }
  .dp-mouth::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 85%; height: 60%; background: radial-gradient(ellipse at center top, #d45d5d 0%, #b84545 60%, #8a2f2f 100%); border-radius: 0 0 50% 50% / 0 0 100% 100%; }
  .dp-avatar-wrap.speaking .dp-mouth { animation: dp-mouth-talk 0.6s ease-in-out infinite; }
  @keyframes dp-mouth-talk {
    0%   { transform: translateX(-50%) scaleY(1) scaleX(1); }
    16%  { transform: translateX(-50%) scaleY(0.85) scaleX(0.95); }
    33%  { transform: translateX(-50%) scaleY(1.3) scaleX(0.7); }
    50%  { transform: translateX(-50%) scaleY(0.9) scaleX(0.65); }
    66%  { transform: translateX(-50%) scaleY(0.5) scaleX(1.1); }
    83%  { transform: translateX(-50%) scaleY(1.1) scaleX(0.85); }
    100% { transform: translateX(-50%) scaleY(1) scaleX(1); }
  }
  .dp-gesture-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; display: flex; align-items: center; justify-content: center; }
  .dp-gesture-pop { font-size: 96px; line-height: 1; opacity: 0; }
  .dp-gesture-pop.show { animation: dp-gesture-pop 1.3s ease forwards; }
  @keyframes dp-gesture-pop { 0%{opacity:0;transform:scale(0.3) translateY(10px)} 20%{opacity:1;transform:scale(1.15) translateY(-5px)} 50%{opacity:1;transform:scale(1) translateY(0)} 80%{opacity:1;transform:scale(1) translateY(0)} 100%{opacity:0;transform:scale(0.8) translateY(-24px)} }
  .dp-avatar-name { font-size: 26px; font-weight: 700; letter-spacing: -0.3px; }
  .dp-tagline { font-size: 14px; color: rgba(255,255,255,0.4); min-height: 20px; text-align: center; transition: color 0.3s; }
  .dp-tagline.active { color: var(--yellow); }
  .dp-waveform { display: flex; align-items: center; gap: 3px; height: 24px; margin-top: 4px; }
  .dp-wave-bar { width: 3px; background: rgba(245,196,0,0.25); border-radius: 2px; height: 6px; transition: height 0.2s; }
  .dp-wave-bar.active { background: var(--yellow); animation: dp-wave 0.8s ease-in-out infinite alternate; }
  .dp-wave-bar:nth-child(1).active { animation-delay: 0s;    height: 12px; }
  .dp-wave-bar:nth-child(2).active { animation-delay: 0.1s;  height: 20px; }
  .dp-wave-bar:nth-child(3).active { animation-delay: 0.2s;  height: 16px; }
  .dp-wave-bar:nth-child(4).active { animation-delay: 0.05s; height: 22px; }
  .dp-wave-bar:nth-child(5).active { animation-delay: 0.15s; height: 14px; }
  .dp-wave-bar:nth-child(6).active { animation-delay: 0.25s; height: 18px; }
  .dp-wave-bar:nth-child(7).active { animation-delay: 0.1s;  height: 10px; }
  .dp-wave-bar:nth-child(8).active { animation-delay: 0.2s;  height: 20px; }
  .dp-wave-bar:nth-child(9).active { animation-delay: 0.05s; height: 14px; }
  @keyframes dp-wave { from { transform: scaleY(0.5); } to { transform: scaleY(1.4); } }
  .dp-waiting { text-align: center; color: rgba(255,255,255,0.2); font-size: 13px; margin-top: 0.5rem; animation: dp-fade-pulse 2.5s ease infinite; }
  @keyframes dp-fade-pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }

  /* TIMER */
  .dp-timer-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 10px; opacity: 0; transition: opacity 0.4s; }
  .dp-timer-wrap.visible { opacity: 1; }
  .dp-timer-ring-svg { transform: rotate(-90deg); }
  .dp-timer-bg   { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 5; }
  .dp-timer-fill { fill: none; stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 1s linear, stroke 0.5s; }
  .dp-timer-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); text-align: center; }
  .dp-timer-num { font-size: 32px; font-weight: 800; line-height: 1; color: #fff; letter-spacing: 1px; }
  .dp-timer-lbl { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .dp-timer-container { position: relative; width: 120px; height: 120px; }
  .dp-timer-done { font-size: 15px; font-weight: 700; color: #DC2626; letter-spacing: 0.5px; animation: dp-timer-flash 0.5s ease-in-out infinite alternate; }
  @keyframes dp-timer-flash { from{opacity:1} to{opacity:0.3} }

  /* SCORE */
  .dp-score-col { position: absolute; right: 0; top: 50%; transform: translateY(-50%) translateX(40px); width: 380px; opacity: 0; transition: opacity 0.6s ease, transform 0.6s ease; pointer-events: none; }
  .dp-score-col.visible { opacity: 1; transform: translateY(-50%) translateX(0); pointer-events: auto; }
  .dp-score-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 1.8rem; }
  .dp-score-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.4rem; }
  .dp-score-team-label { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 4px; }
  .dp-score-team-name { font-size: 18px; font-weight: 700; }
  .dp-score-total-num { font-size: 48px; font-weight: 800; line-height: 1; }
  .dp-score-total-max { font-size: 13px; color: rgba(255,255,255,0.4); text-align: right; margin-top: 2px; }
  .dp-score-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .dp-score-row-label { font-size: 13px; color: rgba(255,255,255,0.55); min-width: 120px; }
  .dp-score-bar-wrap { flex: 1; height: 7px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; }
  .dp-score-bar-fill { height: 100%; background: var(--yellow); border-radius: 4px; width: 0; transition: width 1s ease 0.3s; }
  .dp-score-val { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.7); min-width: 36px; text-align: right; }
  .dp-score-divider { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 1rem 0; }
  .dp-score-summary { font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.7; }
  .dp-score-section-label { font-size: 11px; color: rgba(255,255,255,0.35); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 6px; }
  .dp-score-bullet { font-size: 12px; color: rgba(255,255,255,0.65); padding: 2px 0; line-height: 1.5; }
  .dp-badge-result { display: inline-block; background: rgba(45,122,58,0.2); border: 1px solid rgba(45,122,58,0.4); color: #4CAF50; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.5px; margin-bottom: 1rem; }

  /* QUESTION */
  .dp-question-col { position: absolute; right: 0; top: 50%; transform: translateY(-50%) translateX(40px); width: 380px; opacity: 0; transition: opacity 0.5s ease, transform 0.5s ease; pointer-events: none; z-index: 2; }
  .dp-question-col.visible { opacity: 1; transform: translateY(-50%) translateX(0); pointer-events: auto; }
  .dp-question-card { background: rgba(245,196,0,0.06); border: 1px solid rgba(245,196,0,0.35); border-radius: 20px; padding: 1.8rem; }
  .dp-question-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(245,196,0,0.15); border: 1px solid rgba(245,196,0,0.4); color: var(--yellow); font-size: 10px; font-weight: 700; padding: 3px 12px; border-radius: 20px; letter-spacing: 0.5px; margin-bottom: 1.2rem; text-transform: uppercase; }
  .dp-question-badge::before { content: ''; display: inline-block; width: 6px; height: 6px; background: var(--yellow); border-radius: 50%; animation: blink 1.2s ease infinite; }
  .dp-question-label { font-size: 11px; color: rgba(255,255,255,0.35); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 0.8rem; }
  .dp-question-text { font-size: 20px; font-weight: 600; line-height: 1.65; color: #fff; letter-spacing: -0.2px; }
  .dp-question-hint { margin-top: 1.2rem; font-size: 12px; color: rgba(255,255,255,0.3); font-style: italic; }

  /* BOTTOM */
  .dp-bottom { display: flex; align-items: center; justify-content: center; gap: 8px; padding-bottom: 0.5rem; }
  .dp-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4CAF50; animation: blink 2s ease infinite; }
  .dp-status-dot.busy { background: var(--yellow); }
  .dp-status-text { font-size: 12px; color: rgba(255,255,255,0.4); }
`

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SCORE_LABELS = [
  { key: 'creativity',   label: 'ความคิดสร้างสรรค์', max: 25 },
  { key: 'feasibility',  label: 'ความเป็นไปได้',      max: 25 },
  { key: 'clarity',      label: 'ความชัดเจน',          max: 25 },
  { key: 'impact',       label: 'ผลกระทบ',             max: 25 },
]

const INIT_STATE = {
  teamName: 'รอทีม...',
  sessionId: '',
  tagline: 'กรรมการ AI สำหรับการประกวดไอเดีย',
  speaking: false,
  busy: false,
  statusText: 'รอ admin เปิด Besties AI...',
  showWaiting: true,
  question: null,
  score: null,
  timer: null,
  gestureIcon: '',
  gestureAnim: '',
}

export default function DisplayPage() {
  const [state, setState] = useState(() => {
    try {
      const sess  = localStorage.getItem('besties_display_session')
      const score = localStorage.getItem('besties_display_score')
      const base  = { ...INIT_STATE }
      if (sess)  { const m = JSON.parse(sess);  base.teamName = m.teamName || 'รอทีม...'; base.sessionId = m.sessionId || ''; base.showWaiting = false }
      if (score) { base.score = JSON.parse(score)?.data || null }
      return base
    } catch (_) { return { ...INIT_STATE } }
  })

  const timerRef  = useRef(null)
  const gestureTimerRef = useRef(null)
  const avatarRef = useRef(null)

  const handleMessage = useCallback((msg) => {
    if (!msg?.type) return

    if (msg.type === 'reset') {
      setState({ ...INIT_STATE })
    }
    if (msg.type === 'session') {
      setState(s => ({ ...s, teamName: msg.teamName || 'ทีม?', sessionId: msg.sessionId || '', showWaiting: false, question: null, score: null }))
    }
    if (msg.type === 'avatar') {
      const speaking = msg.state === 'speaking'
      const busy     = msg.state !== 'idle'
      setState(s => ({ ...s, speaking, busy, tagline: msg.tagline || s.tagline, statusText: msg.status || 'พร้อมใช้งาน', showWaiting: false }))
    }
    if (msg.type === 'gesture') {
      clearTimeout(gestureTimerRef.current)
      setState(s => ({ ...s, gestureIcon: msg.icon || '', gestureAnim: msg.anim || 'gesture-bounce' }))
      // animate
      const w = avatarRef.current
      if (w && !w.classList.contains('speaking')) {
        w.classList.remove('gesture-bounce', 'gesture-shake', 'gesture-pulse')
        void w.offsetWidth
        w.classList.add(msg.anim || 'gesture-bounce')
        setTimeout(() => w.classList.remove('gesture-bounce', 'gesture-shake', 'gesture-pulse'), 650)
      }
      gestureTimerRef.current = setTimeout(() => setState(s => ({ ...s, gestureIcon: '', gestureAnim: '' })), 1400)
    }
    if (msg.type === 'score') {
      setState(s => ({ ...s, score: msg.data || null, question: null }))
    }
    if (msg.type === 'question') {
      if (msg.text) setState(s => ({ ...s, question: msg.text, score: null, showWaiting: false }))
    }
    if (msg.type === 'question_clear') {
      setState(s => ({ ...s, question: null }))
    }
    if (msg.type === 'timer') {
      setState(s => ({ ...s, timer: msg }))
    }
  }, [])

  useChannel(handleMessage)

  // timer display
  const timer = state.timer
  const timerColor = timer
    ? (timer.done || timer.remaining <= 30 ? '#DC2626' : timer.remaining <= timer.total * 0.25 ? '#E85C0D' : '#4CAF50')
    : '#4CAF50'
  const timerOffset = timer && timer.total > 0 ? CIRC * (1 - timer.remaining / timer.total) : 0
  const timerText   = timer
    ? `${Math.floor(timer.remaining / 60)}:${String(timer.remaining % 60).padStart(2, '0')}`
    : '5:00'

  // score
  const score   = state.score
  const totalScore = score?.totalScore || 0
  const scoreColor = totalScore >= 80 ? '#4CAF50' : totalScore >= 60 ? '#F5C400' : '#F97316'

  return (
    <>
      <style>{css}</style>

      <div className="dp-bg-rings">
        <div className="dp-ring dp-ring-1" />
        <div className="dp-ring dp-ring-2" />
        <div className="dp-ring dp-ring-3" />
      </div>

      <div className="dp-root">
        {/* TOP BAR */}
        <div className="dp-top">
          <div className="dp-logo">
            <img src="/Besties.png" alt="Besties AI" onError={e => (e.target.style.display = 'none')} />
            <div>
              <div className="dp-logo-name">Besties AI</div>
              <div className="dp-logo-sub">BizPitching Judge</div>
            </div>
          </div>
          <div className="dp-team-chip">
            <div>
              <div className="dp-team-label">ทีมที่กำลังนำเสนอ</div>
              <div className="dp-team-name">{state.teamName}</div>
            </div>
          </div>
          <div className="dp-session-chip">
            {state.sessionId ? `SESSION ${state.sessionId}` : 'SESSION —'}
          </div>
        </div>

        {/* CENTER */}
        <div className="dp-center">
          {/* AVATAR */}
          <div className="dp-avatar-col">
            <div className="dp-avatar-glow" />
            <div className={`dp-avatar-wrap${state.speaking ? ' speaking' : ''}`} ref={avatarRef}>
              <img src="/Besties.png" alt="Besties AI" onError={e => (e.target.style.display = 'none')} />
              <div className="dp-mouth" />
              <div className="dp-gesture-overlay">
                <div className={`dp-gesture-pop${state.gestureIcon ? ' show' : ''}`}>
                  {state.gestureIcon}
                </div>
              </div>
            </div>
            <div className="dp-avatar-name">Besties AI</div>
            <div className={`dp-tagline${state.busy ? ' active' : ''}`}>{state.tagline}</div>
            <div className="dp-waveform">
              {[...Array(9)].map((_, i) => (
                <div key={i} className={`dp-wave-bar${state.speaking ? ' active' : ''}`} />
              ))}
            </div>
            {state.showWaiting && (
              <div className="dp-waiting">เปิด /system เพื่อเริ่มต้นใช้งาน</div>
            )}
            {/* TIMER */}
            <div className={`dp-timer-wrap${timer ? ' visible' : ''}`}>
              <div className="dp-timer-container">
                <svg className="dp-timer-ring-svg" width="120" height="120" viewBox="0 0 120 120">
                  <circle className="dp-timer-bg" cx="60" cy="60" r="52" />
                  <circle
                    className="dp-timer-fill"
                    cx="60" cy="60" r="52"
                    strokeDasharray={CIRC}
                    strokeDashoffset={timerOffset}
                    stroke={timerColor}
                  />
                </svg>
                <div className="dp-timer-center">
                  <div className="dp-timer-num" style={{ color: timer?.done || timer?.remaining <= 30 ? '#DC2626' : timer?.remaining <= (timer?.total * 0.25) ? '#E85C0D' : '#fff' }}>
                    {timerText}
                  </div>
                  <div className="dp-timer-lbl">
                    {timer?.done ? '' : timer?.running ? 'กำลังนับถอยหลัง' : 'เวลานำเสนอ'}
                  </div>
                </div>
              </div>
              {timer?.done && <div className="dp-timer-done">⏰ หมดเวลา!</div>}
            </div>
          </div>

          {/* QUESTION */}
          <div className={`dp-question-col${state.question ? ' visible' : ''}`}>
            <div className="dp-question-card">
              <div className="dp-question-badge">AI Bestie ถาม</div>
              <div className="dp-question-label">คำถามสำหรับทีม</div>
              <div className="dp-question-text">{state.question}</div>
              <div className="dp-question-hint">ตอบคำถามนี้ภายในเวลาที่กำหนด</div>
            </div>
          </div>

          {/* SCORE */}
          {score && (
            <div className={`dp-score-col${score ? ' visible' : ''}`}>
              <div className="dp-score-card">
                <div className="dp-badge-result">📊 ANALYSIS RESULT</div>
                <div className="dp-score-header">
                  <div>
                    <div className="dp-score-team-label">ทีม</div>
                    <div className="dp-score-team-name">{escHtml(score.teamName || '—')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="dp-score-total-num" style={{ color: scoreColor }}>{totalScore}</div>
                    <div className="dp-score-total-max">/ 100 คะแนน</div>
                  </div>
                </div>
                {SCORE_LABELS.map(({ key, label, max }) => {
                  const val = score.breakdown?.[key] || 0
                  const pct = Math.round((val / max) * 100)
                  return (
                    <div className="dp-score-row" key={key}>
                      <span className="dp-score-row-label">{label}</span>
                      <div className="dp-score-bar-wrap">
                        <div className="dp-score-bar-fill" style={{ width: pct + '%' }} />
                      </div>
                      <span className="dp-score-val">{val}/{max}</span>
                    </div>
                  )
                })}
                <hr className="dp-score-divider" />
                <div className="dp-score-summary">{score.summary}</div>
                {(score.strengths || []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="dp-score-section-label">จุดเด่น</div>
                    {score.strengths.map((s, i) => <div className="dp-score-bullet" key={i}>• {s}</div>)}
                  </div>
                )}
                {(score.improvements || []).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="dp-score-section-label">ข้อควรปรับปรุง</div>
                    {score.improvements.map((s, i) => <div className="dp-score-bullet" key={i}>• {s}</div>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM */}
        <div className="dp-bottom">
          <div className={`dp-status-dot${state.busy ? ' busy' : ''}`} />
          <span className="dp-status-text">{state.statusText}</span>
        </div>
      </div>
    </>
  )
}
