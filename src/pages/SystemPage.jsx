import { useState, useEffect, useRef, useCallback } from 'react'
import { useChannel } from '../hooks/useChannel.js'
import { useSTT }     from '../hooks/useSTT.js'
import { geminiChat, geminiTTS } from '../lib/gemini.js'
import { saveKBEntry, fetchKBContext, registerSession, fetchSessions, analyzeViaN8N, fetchJuryScores } from '../lib/api.js'

// ── CONFIG ────────────────────────────────────────────────────────────────────
const BESTIE_BASE = `คุณคือ "Besties" AI พิธีกรดิจิทัลสำหรับงานประกวดไอเดียนวัตกรรม
บุคลิก: หนุ่มอายุ 18 ปี มั่นใจ ทันสมัย เป็นมิตร มีพลังงาน ไม่ทางการจนเกินไป
ใช้สรรพนาม "ผม" เรียกผู้เข้าแข่งขันว่า "คุณ" หรือชื่อทีมถ้าทราบ
พูดภาษาไทยกระชับ เป็นธรรมชาติ ห้ามตอบยาวเกิน 5 ประโยค`

const DEFAULT_PROMPTS = {
  pitch: BESTIE_BASE + `\n\n[Model A — Presentation Analyst]\nฟังการนำเสนอจากผู้เข้าแข่งขัน สรุปเนื้อหาสำคัญ และประเมินเบื้องต้นตามเกณฑ์ 5 ข้อ:\n1. Business Impact — ผลกระทบทางธุรกิจและความคุ้มค่า (0-10)\n2. AI Fit — ความเหมาะสมในการนำ AI มาแก้ปัญหานี้ (0-10)\n3. Feasibility — ความเป็นไปได้ในการพัฒนาจริง (0-10)\n4. Adoption — โอกาสที่ผู้ใช้จะยอมรับและใช้งาน (0-10)\n5. Risk — ความเสี่ยงด้านข้อมูล ความปลอดภัย และจริยธรรม (0-10)\nชี้จุดเด่นของโครงการ พูดเชิงบวกและให้กำลังใจ ไม่ต้องให้คะแนนออกมาตรงๆ`,
  qa:    BESTIE_BASE + `\n\n[Model B — Smart Interrogator]\nวิเคราะห์ช่องว่างในโครงการที่ยังไม่ชัดเจน แล้วตั้งคำถามเจาะลึก 1-2 ข้อที่ท้าทายแต่สร้างสรรค์\nเน้นประเด็น: ความพร้อมของข้อมูล (Data Readiness), ความสามารถขยายระบบ (Scalability), ความเหมาะสมของ AI\nคำถามต้องชัด กระชับ เข้าใจง่าย เพื่อให้ผู้เข้าแข่งขันได้แสดงศักยภาพเพิ่มเติม\nถามตรงๆ ได้เลย ไม่ต้องชมก่อน ไม่ต้องให้คำตอบเอง`,
  analyze: BESTIE_BASE + `\n\n[Model C — Feedback Harmonizer]\nรวบรวมข้อมูลการนำเสนอและการซักถามทั้งหมด แล้วสังเคราะห์เป็น Constructive Feedback เชิงบวก\nเน้นชื่นชมความพยายาม ชี้จุดแข็งที่น่าประทับใจ และแนะนำโอกาสพัฒนาที่ทำได้จริง\nปรับคำวิจารณ์รุนแรงให้กลายเป็นคำแนะนำที่นำไปใช้ต่อได้ ไม่พูดถึงคะแนนตรงๆ\nท้ายสุดให้กำลังใจทีม พร้อมส่งไม้ต่อให้ทีมถัดไป`
}

const GESTURE_DATA = {
  '👋': { phrase: 'สวัสดีครับ ยินดีต้อนรับสู่การแข่งขัน',      anim: 'gesture-bounce' },
  '👍': { phrase: 'เห็นด้วยครับ ไอเดียนี้ดีมาก',               anim: 'gesture-bounce' },
  '🤔': { phrase: 'น่าสนใจนะครับ ขอคิดดูสักครู่',              anim: 'gesture-shake' },
  '👏': { phrase: 'ปรบมือให้เลยครับ ทำได้ยอดเยี่ยมมาก',       anim: 'gesture-bounce' },
  '☝️': { phrase: 'ขอแนะนำว่าควรอธิบายให้ชัดเจนขึ้นอีกนิดนะครับ', anim: 'gesture-pulse' },
  '😐': { phrase: 'อืม ยังลังเลอยู่นิดหน่อยครับ',               anim: 'gesture-shake' },
  '🎉': { phrase: 'ยินดีด้วยครับ สุดยอดไปเลย',                 anim: 'gesture-bounce' },
  '🙏': { phrase: 'ขอบคุณมากครับ ที่ให้เกียรติมาร่วมการแข่งขัน', anim: 'gesture-pulse' },
}

const PHASE_DEFS = { pitch: { label: 'Pitch', seconds: 300 }, aiq: { label: 'AI Q&A', seconds: 300 }, jury: { label: 'กรรมการ', seconds: 300 } }

function initPhases() {
  return Object.fromEntries(Object.entries(PHASE_DEFS).map(([k, v]) => [k, { total: v.seconds, remaining: v.seconds, running: false }]))
}

function timerFmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function getPrompt(mode) {
  return localStorage.getItem('prompt_' + mode) || DEFAULT_PROMPTS[mode] || BESTIE_BASE
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  :root {
    --yellow: #F5C400; --yellow-light: #FFF8D6; --yellow-dark: #C49A00;
    --green: #2D7A3A; --green-light: #E8F5EA; --orange: #E85C0D;
    --bg: #F5F2EC; --surface: #FFFFFF; --surface2: #F0EDE6;
    --text: #1A1A1A; --text2: #5A5550; --text3: #9A9490;
    --border: rgba(0,0,0,0.08); --border2: rgba(0,0,0,0.14);
    --radius: 16px; --radius-sm: 10px;
  }
  .sp-root { font-family: 'Sarabun', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; overflow-x: hidden; }

  /* HEADER */
  .sp-header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 2rem; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
  .sp-header-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; letter-spacing: -0.3px; }
  .sp-brand-dot { width: 10px; height: 10px; background: var(--yellow); border-radius: 50%; display: inline-block; }
  .sp-header-session { display: flex; align-items: center; gap: 12px; }
  .sp-session-badge { background: var(--green-light); color: var(--green); font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
  .sp-session-id { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--text3); }

  /* LAYOUT */
  .sp-main { display: grid; grid-template-columns: 420px 1fr; height: calc(100vh - 60px); }

  /* LEFT PANEL */
  .sp-avatar-panel { background: linear-gradient(170deg, #1A2A1E 0%, #0F1A12 100%); display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 2rem 1.5rem; position: relative; overflow: hidden; }
  .sp-avatar-bg-rings { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -60%); pointer-events: none; }
  .sp-ring { position: absolute; border-radius: 50%; border: 1px solid rgba(245,196,0,0.12); top: 50%; left: 50%; transform: translate(-50%,-50%); }
  .sp-ring-1 { width: 220px; height: 220px; }
  .sp-ring-2 { width: 300px; height: 300px; border-color: rgba(245,196,0,0.08); }
  .sp-ring-3 { width: 380px; height: 380px; border-color: rgba(245,196,0,0.05); }
  .sp-avatar-top { width: 100%; display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 2; }
  .sp-avatar-label { background: rgba(245,196,0,0.15); border: 1px solid rgba(245,196,0,0.3); color: var(--yellow); font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 20px; letter-spacing: 0.8px; text-transform: uppercase; }
  .sp-status-indicator { display: flex; align-items: center; gap: 6px; color: rgba(255,255,255,0.5); font-size: 12px; }
  .sp-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4CAF50; animation: pulse-green 2s infinite; }
  .sp-avatar-container { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; }
  .sp-avatar-glow { position: absolute; width: 200px; height: 200px; background: radial-gradient(circle, rgba(245,196,0,0.15) 0%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%,-50%); border-radius: 50%; pointer-events: none; }
  .sp-avatar-img-wrap { width: 240px; height: 240px; border-radius: 50%; overflow: hidden; border: 3px solid rgba(245,196,0,0.3); position: relative; background: rgba(255,255,255,0.04); }
  .sp-avatar-img-wrap img { width: 100%; height: 100%; object-fit: cover; object-position: center 10%; display: block; position: relative; z-index: 1; }
  .sp-avatar-img-wrap.speaking { border-color: var(--yellow); animation: sp-ring-pulse 0.7s ease-in-out infinite alternate; }
  @keyframes sp-ring-pulse { from{box-shadow:0 0 0 0 rgba(245,196,0,0.4);border-color:rgba(245,196,0,0.6)} to{box-shadow:0 0 0 12px rgba(245,196,0,0);border-color:var(--yellow)} }
  .sp-mouth { position: absolute; top: 45%; left: 50%; transform: translateX(-50%); width: 32px; height: 14px; z-index: 2; pointer-events: none; }
  .sp-mouth::before { content: ''; position: absolute; width: 100%; height: 100%; background: #2a1a1a; border-radius: 0 0 50% 50% / 0 0 100% 100%; box-shadow: inset 0 -3px 8px rgba(0,0,0,0.4); }
  .sp-mouth::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 85%; height: 60%; background: radial-gradient(ellipse at center top, #d45d5d 0%, #b84545 60%, #8a2f2f 100%); border-radius: 0 0 50% 50% / 0 0 100% 100%; }
  .sp-avatar-img-wrap.speaking .sp-mouth { animation: sp-mouth-talk 0.6s ease-in-out infinite; }
  @keyframes sp-mouth-talk { 0%{transform:translateX(-50%) scaleY(1) scaleX(1)} 16%{transform:translateX(-50%) scaleY(0.85) scaleX(0.95)} 33%{transform:translateX(-50%) scaleY(1.3) scaleX(0.7)} 50%{transform:translateX(-50%) scaleY(0.9) scaleX(0.65)} 66%{transform:translateX(-50%) scaleY(0.5) scaleX(1.1)} 83%{transform:translateX(-50%) scaleY(1.1) scaleX(0.85)} 100%{transform:translateX(-50%) scaleY(1) scaleX(1)} }
  .sp-gesture-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; display: flex; align-items: center; justify-content: center; }
  .sp-gesture-emoji { font-size: 72px; line-height: 1; opacity: 0; }
  .sp-gesture-emoji.show { animation: sp-gesture-pop 1.2s ease forwards; }
  @keyframes sp-gesture-pop { 0%{opacity:0;transform:scale(0.3) translateY(10px)} 20%{opacity:1;transform:scale(1.15) translateY(-5px)} 50%{opacity:1;transform:scale(1) translateY(0)} 80%{opacity:1;transform:scale(1) translateY(0)} 100%{opacity:0;transform:scale(0.8) translateY(-20px)} }
  .sp-avatar-img-wrap.gesture-bounce { animation: sp-av-bounce 0.5s ease !important; }
  .sp-avatar-img-wrap.gesture-shake  { animation: sp-av-shake 0.5s ease !important; }
  .sp-avatar-img-wrap.gesture-pulse  { animation: sp-av-pulse 0.6s ease !important; }
  @keyframes sp-av-bounce { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-12px)} 60%{transform:translateY(-5px)} }
  @keyframes sp-av-shake  { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-6deg)} 40%{transform:rotate(6deg)} 60%{transform:rotate(-4deg)} 80%{transform:rotate(4deg)} }
  @keyframes sp-av-pulse  { 0%,100%{transform:scale(1)} 40%{transform:scale(1.08)} 70%{transform:scale(0.96)} }
  .sp-avatar-name { color: #fff; font-size: 20px; font-weight: 700; margin-top: 1rem; letter-spacing: -0.3px; }
  .sp-avatar-tagline { color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 4px; }
  .sp-waveform { display: flex; align-items: center; gap: 4px; height: 32px; margin-top: 12px; }
  .sp-wave-bar { width: 4px; background: rgba(245,196,0,0.25); border-radius: 4px; height: 6px; }
  .sp-wave-bar.active { background: var(--yellow); animation: sp-wave-anim 0.6s ease-in-out infinite alternate; }
  .sp-wave-bar:nth-child(1){animation-delay:0s} .sp-wave-bar:nth-child(2){animation-delay:0.08s} .sp-wave-bar:nth-child(3){animation-delay:0.16s} .sp-wave-bar:nth-child(4){animation-delay:0.24s} .sp-wave-bar:nth-child(5){animation-delay:0.16s} .sp-wave-bar:nth-child(6){animation-delay:0.08s} .sp-wave-bar:nth-child(7){animation-delay:0s} .sp-wave-bar:nth-child(8){animation-delay:0.08s} .sp-wave-bar:nth-child(9){animation-delay:0.16s}
  @keyframes sp-wave-anim { from{height:6px} to{height:28px} }

  /* GESTURE PANEL */
  .sp-gesture-panel { width: 100%; position: relative; z-index: 2; }
  .sp-gesture-label { color: rgba(255,255,255,0.3); font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; text-align: center; }
  .sp-gesture-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .sp-gesture-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 8px 4px; color: rgba(255,255,255,0.7); font-size: 11px; font-family: 'Sarabun', sans-serif; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .sp-gesture-btn:hover { background: rgba(245,196,0,0.15); border-color: rgba(245,196,0,0.4); color: var(--yellow); transform: translateY(-1px); }
  .sp-gesture-btn.triggered { background: rgba(245,196,0,0.25); border-color: var(--yellow); color: var(--yellow); transform: scale(0.96); }
  .sp-gesture-icon { font-size: 18px; }

  /* LEFT BOTTOM (config) */
  .sp-left-config { width: 100%; position: relative; z-index: 2; }
  .sp-config-row { display: flex; gap: 6px; margin-bottom: 8px; }
  .sp-config-input { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 10px; font-size: 11px; font-family: 'IBM Plex Mono', monospace; color: rgba(255,255,255,0.8); outline: none; }
  .sp-config-input:focus { border-color: rgba(245,196,0,0.5); }
  .sp-config-input::placeholder { color: rgba(255,255,255,0.25); }
  .sp-config-btn { background: rgba(245,196,0,0.15); border: 1px solid rgba(245,196,0,0.3); border-radius: 8px; padding: 8px 12px; color: var(--yellow); font-size: 12px; font-family: 'Sarabun', sans-serif; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
  .sp-config-btn:hover { background: rgba(245,196,0,0.25); }

  /* RIGHT PANEL */
  .sp-right-panel { display: grid; grid-template-rows: 1fr auto; overflow: hidden; }
  .sp-transcript-area { overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }

  /* SESSION HEADER */
  .sp-session-header { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius) var(--radius) 0 0; padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; border-bottom: none; }
  .sp-session-info h2 { font-size: 15px; font-weight: 600; }
  .sp-session-info p { font-size: 12px; color: var(--text3); margin-top: 2px; }
  .sp-session-actions { display: flex; gap: 8px; }

  /* TIMER BAR */
  .sp-timer-bar { background: var(--surface); border: 1px solid var(--border); border-radius: 0 0 var(--radius) var(--radius); padding: 10px 1.25rem; display: flex; flex-direction: column; gap: 8px; }
  .sp-phase-tabs { display: flex; gap: 6px; }
  .sp-phase-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 10px; padding: 5px 4px; font-size: 11px; font-family: 'Sarabun', sans-serif; cursor: pointer; color: var(--text3); transition: all 0.2s; line-height: 1.3; }
  .sp-phase-tab:hover { border-color: var(--border2); color: var(--text); }
  .sp-phase-tab.active  { background: var(--green-light); border-color: var(--green); color: var(--green); }
  .sp-phase-tab.running { background: #FFF8D6; border-color: var(--yellow-dark); color: var(--yellow-dark); }
  .sp-phase-tab.done    { background: #FEE2E2; border-color: #DC2626; color: #DC2626; }
  .sp-phase-clock { font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 700; }
  .sp-timer-row { display: flex; align-items: center; gap: 10px; }
  .sp-timer-display { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; min-width: 64px; color: var(--green); letter-spacing: 1px; transition: color 0.5s; }
  .sp-timer-display.warn   { color: #E85C0D; }
  .sp-timer-display.danger { color: #DC2626; animation: sp-timer-flash 0.5s ease-in-out infinite alternate; }
  @keyframes sp-timer-flash { from{opacity:1} to{opacity:0.4} }
  .sp-timer-progress-wrap { flex: 1; height: 5px; background: rgba(0,0,0,0.08); border-radius: 3px; overflow: hidden; }
  .sp-timer-progress-fill { height: 100%; border-radius: 3px; transition: width 1s linear, background 0.5s; }
  .sp-timer-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border2); background: var(--surface2); font-size: 14px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
  .sp-timer-btn:hover { background: var(--yellow-light); border-color: var(--yellow); }
  .sp-timer-btn.active { background: var(--yellow); border-color: var(--yellow-dark); }

  /* STT BOX */
  .sp-stt-box { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 1rem 1.25rem; min-height: 72px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.3s; }
  .sp-stt-box.listening  { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(232,92,13,0.1); }
  .sp-stt-box.processing { border-color: var(--yellow); box-shadow: 0 0 0 3px rgba(245,196,0,0.12); }
  .sp-stt-header { display: flex; align-items: center; justify-content: space-between; }
  .sp-stt-indicator { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--text3); }
  .sp-stt-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text3); }
  .sp-stt-dot.listening  { background: var(--orange); animation: sp-pulse-red 1s infinite; }
  .sp-stt-dot.processing { background: var(--yellow-dark); animation: sp-pulse-yellow 0.8s infinite; }
  @keyframes sp-pulse-red    { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.3);opacity:0.7} }
  @keyframes sp-pulse-yellow { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .sp-stt-live-text { font-size: 15px; color: var(--text); line-height: 1.6; min-height: 24px; }
  .sp-cursor { display: inline-block; width: 2px; height: 16px; background: var(--orange); margin-left: 2px; vertical-align: middle; animation: blink 0.8s steps(2) infinite; }

  /* MESSAGES */
  .sp-messages-list { display: flex; flex-direction: column; gap: 12px; }
  .sp-msg { display: flex; gap: 10px; align-items: flex-start; }
  .sp-msg.user { flex-direction: row-reverse; }
  .sp-msg-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; }
  .sp-msg-avatar.ai { background: #1A2A1E; border: 1.5px solid rgba(245,196,0,0.4); overflow: hidden; }
  .sp-msg-avatar.ai img { width: 100%; height: 100%; object-fit: cover; object-position: center 10%; }
  .sp-msg-avatar.user { background: var(--yellow-light); color: var(--yellow-dark); border: 1.5px solid rgba(245,196,0,0.3); font-size: 13px; }
  .sp-msg-bubble { max-width: 75%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
  .sp-msg.ai   .sp-msg-bubble { background: var(--surface); border: 1px solid var(--border); border-top-left-radius: 4px; }
  .sp-msg.user .sp-msg-bubble { background: #1A2A1E; color: rgba(255,255,255,0.92); border-top-right-radius: 4px; }
  .sp-msg-time { font-size: 11px; color: var(--text3); margin-top: 4px; }
  .sp-msg.ai   .sp-msg-time { text-align: left; margin-left: 42px; }
  .sp-msg.user .sp-msg-time { text-align: right; }
  .sp-kb-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--green-light); color: var(--green); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; margin-top: 6px; margin-right: 4px; }
  .sp-replay-btn { display:inline-flex;align-items:center;gap:4px;background:none;border:1px solid var(--border2);border-radius:20px;padding:3px 10px;font-size:11px;font-family:'Sarabun',sans-serif;color:var(--text3);cursor:pointer;transition:all 0.2s; }
  .sp-replay-btn:hover { border-color:var(--yellow);color:var(--yellow-dark);background:var(--yellow-light); }

  /* SCORE CARD IN CHAT */
  .sp-score-card { background: linear-gradient(145deg, #1A2A1E, #0F1A12); border-radius: 12px; padding: 1.25rem; color: white; }
  .sp-score-total { font-size: 40px; font-weight: 700; line-height: 1; }
  .sp-score-label { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }
  .sp-score-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .sp-score-bar-wrap { flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
  .sp-score-bar-fill { height: 100%; background: var(--yellow); border-radius: 3px; }
  .sp-score-val { font-size: 12px; color: rgba(255,255,255,0.6); min-width: 36px; text-align: right; }

  /* CONTROLS */
  .sp-controls-panel { background: var(--surface); border-top: 1px solid var(--border); padding: 1rem 1.5rem; }
  .sp-controls-top { display: flex; gap: 10px; margin-bottom: 12px; }
  .sp-config-select { background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 7px 12px; font-size: 13px; font-family: 'Sarabun', sans-serif; color: var(--text); flex: 1; cursor: pointer; outline: none; }
  .sp-controls-main { display: flex; align-items: center; gap: 12px; }
  .sp-mic-btn { width: 56px; height: 56px; border-radius: 50%; background: var(--surface2); border: 2px solid var(--border2); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s; flex-shrink: 0; color: var(--text2); }
  .sp-mic-btn:hover { border-color: var(--orange); color: var(--orange); }
  .sp-mic-btn.listening { background: var(--orange); border-color: var(--orange); color: white; animation: sp-mic-pulse 1.5s infinite; }
  @keyframes sp-mic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(232,92,13,0.4)} 50%{box-shadow:0 0 0 12px rgba(232,92,13,0)} }
  .sp-text-input-wrap { flex: 1; position: relative; }
  .sp-text-input { width: 100%; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 28px; padding: 12px 50px 12px 18px; font-size: 14px; font-family: 'Sarabun', sans-serif; color: var(--text); outline: none; resize: none; height: 48px; transition: border-color 0.2s; }
  .sp-text-input:focus { border-color: var(--yellow); }
  .sp-text-input::placeholder { color: var(--text3); }
  .sp-send-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; background: var(--yellow); border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: #1A1A1A; }
  .sp-send-btn:hover { background: var(--yellow-dark); color: white; transform: translateY(-50%) scale(1.05); }
  .sp-action-btns { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
  .sp-action-btn { width: 80px; padding: 6px 0; border-radius: 8px; border: 1px solid var(--border2); background: var(--surface2); font-size: 11px; font-family: 'Sarabun', sans-serif; color: var(--text2); font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .sp-action-btn:hover { background: var(--yellow-light); border-color: var(--yellow); color: var(--yellow-dark); }
  .sp-action-btn.danger:hover { background: #FEE2E2; border-color: #EF4444; color: #DC2626; }
  .sp-stop-btn { border-color: #EF4444; background: #FEF2F2; color: #DC2626; animation: sp-stop-pulse 1s ease-in-out infinite alternate; }
  @keyframes sp-stop-pulse { from{box-shadow:none} to{box-shadow:0 0 0 3px rgba(239,68,68,0.2)} }

  /* BTN-SM */
  .sp-btn-sm { background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 6px 12px; font-size: 12px; font-family: 'Sarabun', sans-serif; color: var(--text2); cursor: pointer; transition: all 0.2s; font-weight: 500; }
  .sp-btn-sm:hover { background: var(--yellow-light); border-color: var(--yellow); color: var(--yellow-dark); }
  .sp-btn-sm.primary { background: var(--yellow); border-color: var(--yellow-dark); color: #1A1A1A; font-weight: 600; }
  .sp-btn-sm.primary:hover { background: var(--yellow-dark); color: #fff; }

  /* KB PANEL */
  .sp-kb-panel { background: var(--surface); border-left: 1px solid var(--border); width: 300px; padding: 1.25rem; overflow-y: auto; position: absolute; right: 0; top: 0; bottom: 0; transform: translateX(100%); transition: transform 0.3s ease; z-index: 50; }
  .sp-kb-panel.open { transform: translateX(0); }
  .sp-kb-title { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 1rem; text-transform: uppercase; }
  .sp-kb-entry { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .sp-kb-entry-meta { font-size: 11px; color: var(--text3); margin-bottom: 4px; }
  .sp-kb-entry-text { font-size: 13px; color: var(--text); line-height: 1.5; }
  .sp-field-label { font-size: 11px; color: var(--text3); margin-bottom: 6px; margin-top: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .sp-field-input { width: 100%; background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 8px 12px; font-size: 12px; font-family: 'Sarabun', sans-serif; color: var(--text); outline: none; height: 36px; }
  .sp-field-input:focus { border-color: var(--yellow); }
  .sp-textarea { width: 100%; background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 8px 12px; font-size: 12px; font-family: 'Sarabun', sans-serif; color: var(--text); outline: none; resize: vertical; min-height: 80px; }

  /* SESSION OVERLAY */
  .sp-overlay { position: fixed; inset: 0; background: rgba(15,26,18,0.75); z-index: 300; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.25s; backdrop-filter: blur(4px); }
  .sp-overlay.show { opacity: 1; pointer-events: all; }
  .sp-modal { background: var(--surface); border-radius: var(--radius); padding: 2rem; width: 380px; box-shadow: 0 24px 60px rgba(0,0,0,0.3); border: 1px solid var(--border); }
  .sp-modal-title { font-size: 16px; font-weight: 700; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 8px; }

  /* TOAST */
  .sp-toast { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); background: #1A2A1E; border: 1px solid rgba(245,196,0,0.2); border-radius: 10px; padding: 8px 16px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: rgba(255,255,255,0.8); z-index: 400; pointer-events: none; opacity: 0; transition: opacity 0.3s; white-space: nowrap; }
  .sp-toast.show { opacity: 1; }
  .sp-toast-icon { color: var(--yellow); font-weight: 700; font-size: 13px; }

  /* ADMIN SPEAK */
  .sp-admin-textarea { width: 100%; background: var(--surface2); border: 1.5px solid var(--border); border-radius: 28px; padding: 12px 18px; font-size: 14px; font-family: 'Sarabun', sans-serif; color: var(--text); outline: none; resize: none; height: 48px; transition: border-color 0.2s; }
  .sp-admin-textarea:focus { border-color: var(--orange); }
  .sp-admin-btn { background: rgba(232,92,13,0.1); border: 1px solid rgba(232,92,13,0.3); border-radius: 8px; padding: 6px 12px; color: var(--orange); font-size: 12px; font-family: 'Sarabun', sans-serif; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .sp-admin-btn:hover { background: rgba(232,92,13,0.2); }

  .sp-session-item { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; transition: all 0.2s; }
  .sp-session-item:hover { border-color: var(--border2); background: var(--yellow-light); }
  .sp-session-item.active { border-color: var(--green); background: var(--green-light); }

  /* KB panel wider for prompt editor */
  .sp-kb-panel { width: 400px !important; }

  /* PROMPT EDITOR */
  .sp-prompt-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
  .sp-prompt-tab { flex: 1; padding: 5px 4px; border: 1.5px solid var(--border); border-radius: 8px; background: var(--surface2); font-size: 11px; font-family: 'Sarabun', sans-serif; font-weight: 600; color: var(--text3); cursor: pointer; text-align: center; transition: all 0.15s; }
  .sp-prompt-tab:hover { border-color: var(--border2); color: var(--text); }
  .sp-prompt-tab.active { background: var(--yellow-light); border-color: var(--yellow-dark); color: var(--yellow-dark); }
  .sp-prompt-tab.active.qa     { background: #EEF6FF; border-color: #3B82F6; color: #1D4ED8; }
  .sp-prompt-tab.active.analyze { background: var(--green-light); border-color: var(--green); color: var(--green); }
  .sp-prompt-textarea { width: 100%; background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 8px 10px; font-size: 12px; font-family: 'Sarabun', sans-serif; color: var(--text); outline: none; resize: vertical; min-height: 160px; line-height: 1.55; transition: border-color 0.2s; }
  .sp-prompt-textarea:focus { border-color: var(--yellow); }
  .sp-prompt-changed { font-size: 10px; color: var(--orange); font-weight: 600; letter-spacing: 0.3px; }
  .sp-prompt-default { font-size: 10px; color: var(--text3); }
`

export default function SystemPage() {
  // ── STATE ──────────────────────────────────────────────────────────────────
  const [cfg, setCfg] = useState({
    geminiKey:  localStorage.getItem('gemini_key') || '',
    n8nWebhook: localStorage.getItem('n8n_webhook') || '',
    sessionId: 'SESSION-' + Math.floor(Math.random() * 9000 + 1000),
    teamName: '',
    contestant: 0,
  })
  const [avatarState, setAvatarState] = useState('idle')
  const [avatarTagline, setAvatarTagline] = useState('กรรมการ AI สำหรับการประกวดไอเดีย')
  const [gesturePop, setGesturePop] = useState({ icon: '', show: false })
  const [isListening, setIsListening] = useState(false)
  const [sttText, setSttText]     = useState({ final: '', interim: '' })
  const [sttStatus, setSttStatus] = useState('idle') // idle | listening | processing
  const [messages, setMessages]   = useState([])
  const [kbEntries, setKbEntries] = useState([])
  const [kbOpen, setKbOpen]       = useState(false)
  const [phases, setPhases]       = useState(initPhases)
  const [activePhase, setActivePhase] = useState('pitch')
  const [toast, setToast]         = useState({ show: false, icon: '', msg: '' })
  const [showModal, setShowModal] = useState(false)
  const [pendingSession, setPendingSession] = useState({ id: '', teamName: '' })
  const [textInput, setTextInput] = useState('')
  const [adminText, setAdminText] = useState('')
  const [voiceSelect, setVoiceSelect] = useState('Alnilam')
  const [mode, setMode]           = useState('pitch')
  const [briefInput, setBriefInput]   = useState('')
  const [briefStatus, setBriefStatus] = useState('')
  const [sessionsList, setSessionsList] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [configGemini, setConfigGemini] = useState(localStorage.getItem('gemini_key') || '')
  const [configN8N, setConfigN8N]       = useState(localStorage.getItem('n8n_webhook') || '')
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Prompt Editor
  const [promptTab, setPromptTab] = useState('pitch')
  const [promptEdits, setPromptEdits] = useState({
    pitch:   localStorage.getItem('prompt_pitch')   || DEFAULT_PROMPTS.pitch,
    qa:      localStorage.getItem('prompt_qa')      || DEFAULT_PROMPTS.qa,
    analyze: localStorage.getItem('prompt_analyze') || DEFAULT_PROMPTS.analyze,
  })
  const [promptSaved, setPromptSaved] = useState(false)

  const audioRef    = useRef(null)
  const audioUrlRef = useRef(null)
  const timerIvRef  = useRef({})
  const gestureTimerRef = useRef(null)
  const toastTimerRef   = useRef(null)
  const kbRef       = useRef([])
  const cfgRef      = useRef(cfg)
  const modeRef     = useRef(mode)

  cfgRef.current = cfg
  modeRef.current = mode

  const { broadcast } = useChannel(() => {})

  // ── TOAST ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((icon, msg, ms = 2500) => {
    clearTimeout(toastTimerRef.current)
    setToast({ show: true, icon, msg })
    toastTimerRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), ms)
  }, [])

  // ── AVATAR STATE ───────────────────────────────────────────────────────────
  const setAvatar = useCallback((state) => {
    const cfg = {
      speaking: { waves: true,  ring: true,  status: 'กำลังพูด...', tagline: 'กำลังตอบกลับ...' },
      listening:{ waves: false, ring: false, status: 'กำลังฟัง...', tagline: 'พูดได้เลยครับ' },
      thinking: { waves: false, ring: false, status: 'กำลังคิด...', tagline: 'ประมวลผลอยู่...' },
      idle:     { waves: false, ring: false, status: 'พร้อมใช้งาน', tagline: 'กรรมการ AI สำหรับการประกวดไอเดีย' },
    }[state] || { waves: false, ring: false, status: 'พร้อมใช้งาน', tagline: 'กรรมการ AI สำหรับการประกวดไอเดีย' }
    setAvatarState(state)
    setAvatarTagline(cfg.tagline)
    broadcast({ type: 'avatar', state, status: cfg.status, tagline: cfg.tagline })
  }, [broadcast])

  // ── AUDIO ──────────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null }
    if ('speechSynthesis' in window) speechSynthesis.cancel()
    setIsSpeaking(false)
    setAvatar('idle')
  }, [setAvatar])

  const speakText = useCallback(async (text, key) => {
    if (!key) return
    const voice = voiceSelect
    try {
      const blob = await geminiTTS(text, key, voice)
      const url = URL.createObjectURL(blob)
      stopAudio()
      const audio = new Audio(url)
      audioRef.current = audio
      audioUrlRef.current = url
      audio.onplay    = () => { setIsSpeaking(true); setAvatar('speaking') }
      audio.onended   = () => { setIsSpeaking(false); audioRef.current = null; URL.revokeObjectURL(url); audioUrlRef.current = null; setAvatar('idle') }
      audio.onerror   = () => { setIsSpeaking(false); audioRef.current = null; URL.revokeObjectURL(url); audioUrlRef.current = null; setAvatar('idle'); showToast('⚠️', 'ไม่สามารถเล่นเสียงได้') }
      await audio.play()
    } catch (err) {
      showToast('⚠️', 'TTS: ' + err.message)
      if ('speechSynthesis' in window) {
        setAvatar('speaking'); setIsSpeaking(true)
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'th-TH'; u.rate = 1.0
        u.onstart = () => setAvatar('speaking')
        u.onend   = () => { setIsSpeaking(false); setAvatar('idle') }
        u.onerror = () => { setIsSpeaking(false); setAvatar('idle') }
        speechSynthesis.speak(u)
      } else { setAvatar('idle') }
    }
  }, [voiceSelect, stopAudio, setAvatar, showToast])

  // ── MESSAGES ───────────────────────────────────────────────────────────────
  const addMsg = useCallback((role, text, badge = null) => {
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    setMessages(m => [...m, { id: Date.now() + Math.random(), role, text, time, badge }])
  }, [])

  // ── KNOWLEDGE BASE ─────────────────────────────────────────────────────────
  const saveKB = useCallback((text) => {
    const kw = ['ไอเดีย','นวัตกรรม','ปัญหา','กลุ่มเป้าหมาย','ตลาด','รายได้','ต้นทุน','เทคโนโลยี','AI','แอป','แพลตฟอร์ม']
    const entry = { text, ts: new Date().toISOString(), tags: kw.filter(k => text.includes(k)).slice(0, 3) }
    kbRef.current = [...kbRef.current, entry]
    setKbEntries([...kbRef.current])
  }, [])

  // ── GEMINI CHAT ────────────────────────────────────────────────────────────
  const processInput = useCallback(async (text) => {
    const currentMode = modeRef.current
    const currentCfg  = cfgRef.current
    addMsg('user', text)
    if (currentMode === 'qa') {
      saveKBEntry({ type: 'qa_answer', text, session: currentCfg.sessionId, ts: new Date().toISOString() })
    } else {
      saveKB(text)
      saveKBEntry({ type: 'stt', text, session: currentCfg.sessionId, ts: new Date().toISOString() })
    }

    const key = currentCfg.geminiKey || localStorage.getItem('gemini_key')
    if (!key) { showToast('🔑', 'กรุณาใส่ Gemini API Key'); return }

    setAvatar('thinking')
    setSttStatus('processing')

    try {
      const n8nContext   = await fetchKBContext(currentCfg.sessionId)
      const localContext = kbRef.current.slice(-6).map(e => e.text).join('\n')
      const juryContext  = currentMode === 'analyze' ? await fetchJuryScores(currentCfg.sessionId) : ''
      const context      = (n8nContext || localContext) + juryContext
      const prompt       = getPrompt(currentMode)

      const { text: reply, truncated } = await geminiChat({ key, prompt, context, userText: text, mode: currentMode })
      if (truncated) showToast('⚠️', 'ข้อความถูกตัดเนื่องจากยาวเกิน')

      addMsg('ai', reply)
      saveKBEntry({ type: 'ai_response', text: reply, session: currentCfg.sessionId })

      if (currentMode === 'qa') broadcast({ type: 'question', text: reply })
      else broadcast({ type: 'question_clear' })

      await speakText(reply, key)
    } catch (err) {
      addMsg('ai', 'ขออภัยครับ เกิดข้อผิดพลาด: ' + err.message)
      showToast('❌', err.message)
      setAvatar('idle')
    } finally {
      setSttStatus('idle')
    }
  }, [addMsg, saveKB, setAvatar, broadcast, speakText, showToast])

  // ── STT ────────────────────────────────────────────────────────────────────
  const { start: sttStart, stop: sttStop } = useSTT({
    onResult: ({ final, interim }) => setSttText({ final, interim }),
    onError:  (msg) => showToast('⚠️', msg),
  })

  const toggleMic = useCallback(() => {
    if (isSpeaking) { stopAudio(); return }
    if (isListening) {
      setIsListening(false)
      setSttStatus('idle')
      const text = sttStop()
      setSttText({ final: '', interim: '' })
      if (text) processInput(text)
      else setAvatar('idle')
    } else {
      sttStart()
      setIsListening(true)
      setSttStatus('listening')
      setAvatar('listening')
    }
  }, [isSpeaking, isListening, sttStart, sttStop, processInput, setAvatar, stopAudio])

  const sendText = useCallback(async () => {
    const t = textInput.trim()
    if (!t) return
    setTextInput('')
    await processInput(t)
  }, [textInput, processInput])

  // ── ANALYZE ────────────────────────────────────────────────────────────────
  const analyzeIdea = useCallback(async () => {
    const key  = cfgRef.current.geminiKey || localStorage.getItem('gemini_key')
    if (!key) { showToast('🔑', 'กรุณาใส่ Gemini API Key'); return }
    setAvatar('thinking')
    showToast('🔄', 'กำลังวิเคราะห์...')
    try {
      const data = await analyzeViaN8N(cfgRef.current.sessionId, cfgRef.current.teamName, key)
      const score = data.totalScore || 0
      const scoreColor = score >= 80 ? '#4CAF50' : score >= 60 ? '#F5C400' : '#F97316'
      addMsg('ai', null, { type: 'score', data, scoreColor })
      broadcast({ type: 'score', data })
      const summary = `คะแนนรวมทีม ${data.teamName} ได้ ${data.totalScore} คะแนนจาก 100 คะแนนครับ ${data.summary || ''}`
      await speakText(summary, key)
    } catch (err) {
      showToast('❌', err.message)
      addMsg('ai', 'วิเคราะห์ไม่สำเร็จ: ' + err.message)
      setAvatar('idle')
    }
  }, [addMsg, broadcast, setAvatar, speakText, showToast])

  // ── GESTURE ────────────────────────────────────────────────────────────────
  const triggerGesture = useCallback((icon, label) => {
    const gdata = GESTURE_DATA[icon] || { anim: 'gesture-bounce' }
    clearTimeout(gestureTimerRef.current)
    setGesturePop({ icon, show: true })
    setAvatarTagline(`${icon} ${label}...`)
    gestureTimerRef.current = setTimeout(() => {
      setGesturePop({ icon: '', show: false })
      setAvatarTagline('กรรมการ AI สำหรับการประกวดไอเดีย')
    }, 1300)
    broadcast({ type: 'gesture', icon, label, anim: gdata.anim })
    showToast(icon, label)
    const key = cfgRef.current.geminiKey || localStorage.getItem('gemini_key')
    if (gdata.phrase && key && !isSpeaking) speakText(gdata.phrase, key)
  }, [broadcast, showToast, isSpeaking, speakText])

  // ── TIMER ──────────────────────────────────────────────────────────────────
  const timerFmtDisplay = (phase) => timerFmt(phase.remaining)

  const broadcastTimer = useCallback((phaseName, ph) => {
    broadcast({ type: 'timer', phase: phaseName, label: PHASE_DEFS[phaseName].label, remaining: ph.remaining, total: ph.total, running: ph.running, done: ph.remaining === 0 })
  }, [broadcast])

  const timerToggle = useCallback(() => {
    const ph = phases[activePhase]
    if (ph.remaining <= 0) return
    if (ph.running) {
      clearInterval(timerIvRef.current[activePhase])
      timerIvRef.current[activePhase] = null
      setPhases(p => ({ ...p, [activePhase]: { ...p[activePhase], running: false } }))
      broadcastTimer(activePhase, { ...ph, running: false })
    } else {
      const iv = setInterval(() => {
        setPhases(p => {
          const cur = p[activePhase]
          if (cur.remaining <= 0) {
            clearInterval(timerIvRef.current[activePhase])
            timerIvRef.current[activePhase] = null
            showToast('⏰', `หมดเวลา ${PHASE_DEFS[activePhase].label}!`)
            const updated = { ...cur, running: false }
            broadcastTimer(activePhase, updated)
            return { ...p, [activePhase]: updated }
          }
          const updated = { ...cur, remaining: cur.remaining - 1 }
          broadcastTimer(activePhase, updated)
          return { ...p, [activePhase]: updated }
        })
      }, 1000)
      timerIvRef.current[activePhase] = iv
      setPhases(p => ({ ...p, [activePhase]: { ...p[activePhase], running: true } }))
      broadcastTimer(activePhase, { ...ph, running: true })
    }
  }, [phases, activePhase, broadcastTimer, showToast])

  const timerReset = useCallback(() => {
    clearInterval(timerIvRef.current[activePhase])
    timerIvRef.current[activePhase] = null
    const total = PHASE_DEFS[activePhase].seconds
    setPhases(p => ({ ...p, [activePhase]: { total, remaining: total, running: false } }))
    broadcastTimer(activePhase, { total, remaining: total, running: false })
  }, [activePhase, broadcastTimer])

  // ── SESSION ────────────────────────────────────────────────────────────────
  const openSessionModal = useCallback(() => {
    const id = 'SESSION-' + Math.floor(Math.random() * 9000 + 1000)
    setPendingSession({ id, teamName: '' })
    setShowModal(true)
  }, [])

  const startSession = useCallback(() => {
    const { id, teamName: rawName } = pendingSession
    const teamName = rawName.trim() || `ผู้แข่งขัน ${cfgRef.current.contestant + 1}`
    setCfg(c => ({ ...c, sessionId: id, teamName, contestant: c.contestant + 1 }))
    kbRef.current = []
    setKbEntries([])
    setMessages([])
    setShowModal(false)
    registerSession(id, teamName)
    broadcast({ type: 'session', sessionId: id, teamName })
    const welcome = `ยินดีต้อนรับทีม ${teamName} ครับ! 🎉 พร้อมแล้ว กรุณาแนะนำตัวและนำเสนอไอเดียได้เลยนะครับ`
    addMsg('ai', welcome)
    const key = cfgRef.current.geminiKey || localStorage.getItem('gemini_key')
    if (key) speakText(welcome, key)
    showToast('✅', `เริ่ม session: ${teamName}`)
  }, [pendingSession, addMsg, broadcast, speakText, showToast])

  const saveConfig = useCallback(() => {
    if (configGemini) { localStorage.setItem('gemini_key', configGemini); setCfg(c => ({ ...c, geminiKey: configGemini })) }
    if (configN8N)    { localStorage.setItem('n8n_webhook', configN8N);   setCfg(c => ({ ...c, n8nWebhook: configN8N })) }
    showToast('✅', 'บันทึกการตั้งค่าสำเร็จ')
    setKbOpen(false)
  }, [configGemini, configN8N, showToast])

  const savePrompts = useCallback(() => {
    Object.entries(promptEdits).forEach(([k, v]) => localStorage.setItem('prompt_' + k, v))
    setPromptSaved(true)
    setTimeout(() => setPromptSaved(false), 2000)
    showToast('💾', 'บันทึก Prompt เรียบร้อยแล้ว')
  }, [promptEdits, showToast])

  const resetPrompt = useCallback((mode) => {
    if (!confirm(`รีเซ็ต Prompt "${mode}" กลับเป็นค่าเริ่มต้น?`)) return
    localStorage.removeItem('prompt_' + mode)
    setPromptEdits(p => ({ ...p, [mode]: DEFAULT_PROMPTS[mode] }))
    showToast('↺', `รีเซ็ต Prompt "${mode}" แล้ว`)
  }, [showToast])

  const saveProjectBrief = useCallback(async () => {
    if (!briefInput.trim()) { showToast('⚠️', 'กรุณาใส่ข้อมูล Project Brief ก่อน'); return }
    setBriefStatus('กำลังบันทึก...')
    try {
      await saveKBEntry({ type: 'project_brief', text: briefInput, session: cfgRef.current.sessionId, ts: new Date().toISOString() })
      kbRef.current = [{ text: '[Project Brief]\n' + briefInput, ts: new Date().toISOString(), tags: [] }, ...kbRef.current]
      setKbEntries([...kbRef.current])
      setBriefStatus('✅ บันทึกแล้ว — Besties จะใช้ข้อมูลนี้ในการตั้งคำถาม')
      showToast('✅', 'บันทึก Project Brief สำเร็จ')
    } catch (e) {
      setBriefStatus('❌ บันทึกไม่สำเร็จ')
    }
  }, [briefInput, showToast])

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const list = await fetchSessions()
      setSessionsList(list)
    } catch (e) { showToast('❌', 'โหลด sessions ไม่ได้') }
    finally { setLoadingSessions(false) }
  }, [showToast])

  const loadSession = useCallback((sessionId, teamName) => {
    if (!confirm(`สลับไปดู session ของทีม "${teamName}"?`)) return
    setCfg(c => ({ ...c, sessionId, teamName }))
    kbRef.current = []; setKbEntries([]); setMessages([])
    showToast('✅', `โหลด session: ${teamName}`)
    setKbOpen(false)
  }, [showToast])

  const clearSession = useCallback(() => {
    if (!confirm('ล้างบทสนทนาทั้งหมด?')) return
    setMessages([]); kbRef.current = []; setKbEntries([])
    stopAudio()
    addMsg('ai', 'ล้างข้อมูลเรียบร้อยแล้วครับ พร้อมเริ่มต้นใหม่ได้เลย!')
  }, [addMsg, stopAudio])

  const exportSession = useCallback(() => {
    const blob = new Blob([JSON.stringify({ session: cfg.sessionId, teamName: cfg.teamName, date: new Date().toISOString(), messages, kb: kbRef.current }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${cfg.teamName || cfg.sessionId}.json`; a.click()
    showToast('✅', 'Export สำเร็จ!')
  }, [cfg, messages, showToast])

  const adminSpeak = useCallback(async () => {
    if (!adminText.trim()) return
    const key = cfgRef.current.geminiKey || localStorage.getItem('gemini_key')
    if (!key) { showToast('🔑', 'กรุณาใส่ Gemini API Key'); return }
    addMsg('ai', adminText, { type: 'admin' })
    const text = adminText
    setAdminText('')
    await speakText(text, key)
  }, [adminText, addMsg, speakText, showToast])

  const replayMsg = useCallback((text) => {
    const key = cfgRef.current.geminiKey || localStorage.getItem('gemini_key')
    if (!key) { showToast('🔑', 'กรุณาใส่ Gemini API Key'); return }
    speakText(text, key)
  }, [speakText, showToast])

  // ── INIT ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    broadcast({ type: 'reset' })
    localStorage.removeItem('besties_display_session')
    localStorage.removeItem('besties_display_score')
    // open session modal after mount
    setTimeout(() => openSessionModal(), 400)
    return () => {
      Object.values(timerIvRef.current).forEach(iv => iv && clearInterval(iv))
    }
  }, []) // eslint-disable-line

  // broadcast timer on activePhase change
  useEffect(() => {
    broadcastTimer(activePhase, phases[activePhase])
  }, [activePhase]) // eslint-disable-line

  // mode change → clear question
  const handleModeChange = (e) => {
    const newMode = e.target.value
    setMode(newMode)
    if (newMode !== 'qa') broadcast({ type: 'question_clear' })
  }

  // ── RENDER HELPERS ─────────────────────────────────────────────────────────
  const ph = phases[activePhase]
  const timerPct = ph.total > 0 ? (ph.remaining / ph.total) * 100 : 0
  const timerWarn   = ph.remaining <= ph.total * 0.25
  const timerDanger = ph.remaining <= 30
  const timerDisplayClass = timerDanger ? 'danger' : timerWarn ? 'warn' : ''
  const timerBgColor = timerDanger ? '#DC2626' : timerWarn ? '#E85C0D' : 'var(--green)'

  function phaseTabClass(key) {
    const p = phases[key]
    if (key === activePhase) return 'sp-phase-tab active'
    if (p.running) return 'sp-phase-tab running'
    if (p.remaining === 0) return 'sp-phase-tab done'
    return 'sp-phase-tab'
  }

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <div className="sp-root">

        {/* ── HEADER ── */}
        <div className="sp-header">
          <div className="sp-header-brand">
            <span className="sp-brand-dot" />
            Besties AI
          </div>
          <div className="sp-header-session">
            <span className="sp-session-badge">{cfg.teamName || 'LIVE SESSION'}</span>
            <span className="sp-session-id">{cfg.sessionId}</span>
            <button className="sp-btn-sm" onClick={openSessionModal}>+ ทีมใหม่</button>
            <button className="sp-btn-sm" onClick={() => setKbOpen(o => !o)}>⚙️ ตั้งค่า</button>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div className="sp-main">

          {/* ── LEFT (AVATAR) ── */}
          <div className="sp-avatar-panel">
            <div className="sp-avatar-bg-rings">
              <div className="sp-ring sp-ring-1" /><div className="sp-ring sp-ring-2" /><div className="sp-ring sp-ring-3" />
            </div>

            {/* Top bar */}
            <div className="sp-avatar-top">
              <span className="sp-avatar-label">Besties AI</span>
              <div className="sp-status-indicator">
                <span className="sp-status-dot" />
                <span id="ai-status-text">{avatarState === 'speaking' ? 'กำลังพูด...' : avatarState === 'listening' ? 'กำลังฟัง...' : avatarState === 'thinking' ? 'กำลังคิด...' : 'พร้อมใช้งาน'}</span>
              </div>
            </div>

            {/* Avatar image */}
            <div className="sp-avatar-container">
              <div className="sp-avatar-glow" />
              <div className={`sp-avatar-img-wrap${avatarState === 'speaking' ? ' speaking' : ''}`}>
                <img src="/Besties.png" alt="Besties AI" onError={e => (e.target.style.display = 'none')} />
                <div className="sp-mouth" />
                <div className="sp-gesture-overlay">
                  <div className={`sp-gesture-emoji${gesturePop.show ? ' show' : ''}`}>{gesturePop.icon}</div>
                </div>
              </div>
              <div className="sp-avatar-name">Besties AI</div>
              <div className="sp-avatar-tagline">{avatarTagline}</div>
              <div className="sp-waveform">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className={`sp-wave-bar${avatarState === 'speaking' ? ' active' : ''}`} />
                ))}
              </div>
            </div>

            {/* Gesture */}
            <div className="sp-gesture-panel">
              <div className="sp-gesture-label">Gesture</div>
              <div className="sp-gesture-grid">
                {[['👋','ทักทาย'],['👍','เห็นด้วย'],['🤔','ลังเล'],['👏','ปรบมือ'],['☝️','แนะนำ'],['😐','สงสัย'],['🎉','ยินดี'],['🙏','ขอบคุณ']].map(([icon, label]) => (
                  <button key={icon} className="sp-gesture-btn" onClick={() => triggerGesture(icon, label)}>
                    <span className="sp-gesture-icon">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Admin Speak */}
            <div className="sp-left-config" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input className="sp-admin-textarea" placeholder="🎙️ พูดข้อความที่ต้องการ..." value={adminText} onChange={e => setAdminText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); adminSpeak() } }} style={{ flex: 1, borderRadius: 8, height: 36 }} />
                <button className="sp-admin-btn" onClick={adminSpeak}>พูด</button>
              </div>
              {/* Project Brief */}
              <textarea className="sp-textarea" placeholder="Project Brief — ข้อมูลโครงการล่วงหน้า..." value={briefInput} onChange={e => setBriefInput(e.target.value)} rows={3} style={{ fontSize: 12, marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="sp-config-btn" style={{ flex: 1, fontSize: 11 }} onClick={saveProjectBrief}>📎 บันทึก Brief</button>
                <button className="sp-config-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => { setBriefInput(''); setBriefStatus('') }}>ล้าง</button>
              </div>
              {briefStatus && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{briefStatus}</div>}
            </div>
          </div>

          {/* ── RIGHT ── */}
          <div className="sp-right-panel" style={{ position: 'relative' }}>
            <div className="sp-transcript-area">

              {/* Session header */}
              <div>
                <div className="sp-session-header">
                  <div className="sp-session-info">
                    <h2>{cfg.teamName ? `ทีม: ${cfg.teamName}` : 'ยังไม่ได้ตั้งชื่อทีม'}</h2>
                    <p>Session: {cfg.sessionId} • บันทึกอัตโนมัติ</p>
                  </div>
                  <div className="sp-session-actions">
                    <button className="sp-btn-sm" onClick={analyzeIdea}>📊 วิเคราะห์</button>
                    <button className="sp-btn-sm" onClick={exportSession}>⬇ Export</button>
                  </div>
                </div>
                {/* Timer bar */}
                <div className="sp-timer-bar">
                  <div className="sp-phase-tabs">
                    {Object.keys(PHASE_DEFS).map(k => (
                      <div key={k} className={phaseTabClass(k)} onClick={() => setActivePhase(k)}>
                        <span>{PHASE_DEFS[k].label}</span>
                        <span className="sp-phase-clock">{timerFmt(phases[k].remaining)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="sp-timer-row">
                    <span className={`sp-timer-display ${timerDisplayClass}`}>{timerFmt(ph.remaining)}</span>
                    <div className="sp-timer-progress-wrap">
                      <div className="sp-timer-progress-fill" style={{ width: timerPct + '%', background: timerBgColor }} />
                    </div>
                    <button className={`sp-timer-btn${ph.running ? ' active' : ''}`} onClick={timerToggle}>{ph.running ? '⏸' : '▶'}</button>
                    <button className="sp-timer-btn" onClick={timerReset} title="reset">↺</button>
                  </div>
                </div>
              </div>

              {/* STT live box */}
              <div className={`sp-stt-box${sttStatus === 'listening' ? ' listening' : sttStatus === 'processing' ? ' processing' : ''}`}>
                <div className="sp-stt-header">
                  <div className="sp-stt-indicator">
                    <div className={`sp-stt-dot ${sttStatus !== 'idle' ? sttStatus : ''}`} />
                    <span>
                      {sttStatus === 'listening' ? 'กำลังฟัง... พูดได้เลยครับ'
                      : sttStatus === 'processing' ? 'Gemini กำลังคิด...'
                      : 'รอเริ่ม • กดปุ่มไมค์เพื่อพูด'}
                    </span>
                  </div>
                </div>
                <div className="sp-stt-live-text">
                  <span>{sttText.final}</span>
                  <span style={{ color: 'var(--text2)' }}>{sttText.interim}</span>
                  {sttStatus === 'listening' && <span className="sp-cursor" />}
                </div>
              </div>

              {/* Messages */}
              <div className="sp-messages-list">
                {messages.map(m => (
                  <MessageBubble key={m.id} msg={m} contestant={cfg.contestant} onReplay={replayMsg} />
                ))}
              </div>
            </div>

            {/* CONTROLS */}
            <div className="sp-controls-panel">
              <div className="sp-controls-top">
                <select className="sp-config-select" value={mode} onChange={handleModeChange}>
                  <option value="pitch">🎤 Mode: Pitch (Model A)</option>
                  <option value="qa">❓ Mode: Q&A (Model B)</option>
                  <option value="analyze">📊 Mode: Feedback (Model C)</option>
                </select>
                <select className="sp-config-select" style={{ maxWidth: 150 }} value={voiceSelect} onChange={e => setVoiceSelect(e.target.value)}>
                  <option value="Alnilam">Alnilam (ชาย)</option>
                </select>
              </div>
              <div className="sp-controls-main">
                <button className={`sp-mic-btn${isListening ? ' listening' : ''}`} onClick={toggleMic} title={isListening ? 'หยุดฟัง' : 'เริ่มฟัง'}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8"  y1="23" x2="16" y2="23"/>
                  </svg>
                </button>
                <div className="sp-text-input-wrap">
                  <input className="sp-text-input" placeholder="พิมพ์ข้อความ..." value={textInput} onChange={e => setTextInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendText() }} />
                  <button className="sp-send-btn" onClick={sendText}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </div>
                <div className="sp-action-btns">
                  {isSpeaking && <button className="sp-action-btn sp-stop-btn" onClick={stopAudio}>⏹ หยุด</button>}
                  <button className="sp-action-btn" onClick={() => { const ai = messages.filter(m => m.role === 'ai' && m.text); if (ai.length) replayMsg(ai[ai.length - 1].text) }}>🔊 พูดซ้ำ</button>
                  <button className="sp-action-btn danger" onClick={clearSession}>🗑 ล้าง</button>
                </div>
              </div>
            </div>

            {/* KB/CONFIG PANEL */}
            <div className={`sp-kb-panel${kbOpen ? ' open' : ''}`}>
              <div className="sp-kb-title">ตั้งค่า / Knowledge Base</div>
              <div className="sp-field-label">Gemini API Key</div>
              <input type="password" className="sp-field-input" placeholder="AIza..." value={configGemini} onChange={e => setConfigGemini(e.target.value)} />
              <div className="sp-field-label">N8N Webhook Base URL</div>
              <input className="sp-field-input" placeholder="http://your-n8n:5678/webhook" value={configN8N} onChange={e => setConfigN8N(e.target.value)} />
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="sp-btn-sm primary" style={{ flex: 2 }} onClick={saveConfig}>บันทึก</button>
                <button className="sp-btn-sm" style={{ flex: 1 }} onClick={() => setKbOpen(false)}>ปิด</button>
              </div>

              {/* ── PROMPT EDITOR ── */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="sp-kb-title" style={{ marginBottom: 0 }}>System Prompts</span>
                  <button className="sp-btn-sm primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={savePrompts}>
                    {promptSaved ? '✅ บันทึกแล้ว' : '💾 บันทึก'}
                  </button>
                </div>
                <div className="sp-prompt-tabs">
                  {[['pitch','🎤 Pitch'],['qa','❓ Q&A'],['analyze','📊 Analyze']].map(([k, label]) => (
                    <button
                      key={k}
                      className={`sp-prompt-tab${promptTab === k ? ` active ${k}` : ''}`}
                      onClick={() => setPromptTab(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="sp-prompt-textarea"
                  value={promptEdits[promptTab]}
                  onChange={e => setPromptEdits(p => ({ ...p, [promptTab]: e.target.value }))}
                  spellCheck={false}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className={promptEdits[promptTab] !== DEFAULT_PROMPTS[promptTab] ? 'sp-prompt-changed' : 'sp-prompt-default'}>
                    {promptEdits[promptTab] !== DEFAULT_PROMPTS[promptTab] ? '● แก้ไขแล้ว' : '○ ค่าเริ่มต้น'}
                  </span>
                  <button
                    className="sp-btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => resetPrompt(promptTab)}
                  >
                    ↺ รีเซ็ต
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="sp-kb-title" style={{ marginBottom: 0 }}>Sessions</span>
                  <button className="sp-btn-sm" onClick={loadSessions} disabled={loadingSessions}>{loadingSessions ? '...' : 'โหลด'}</button>
                </div>
                <div id="sessions-list-panel">
                  {sessionsList.length === 0
                    ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '1rem 0' }}>กด "โหลด" เพื่อดู sessions</div>
                    : sessionsList.map(s => (
                      <div key={s.session} className={`sp-session-item${s.session === cfg.sessionId ? ' active' : ''}`} onClick={() => loadSession(s.session, s.teamName || '')}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.teamName || 'ไม่ระบุชื่อ'}</div>
                        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{s.session}</div>
                      </div>
                    ))
                  }
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div className="sp-kb-title">Knowledge Base</div>
                {kbEntries.length === 0
                  ? <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '1.5rem 0' }}>ยังไม่มีข้อมูล</div>
                  : [...kbEntries].reverse().map((e, i) => (
                    <div className="sp-kb-entry" key={i}>
                      <div className="sp-kb-entry-meta">{new Date(e.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="sp-kb-entry-text">{e.text.substring(0, 120)}{e.text.length > 120 ? '...' : ''}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>

        {/* ── SESSION MODAL ── */}
        <div className={`sp-overlay${showModal ? ' show' : ''}`}>
          <div className="sp-modal">
            <div className="sp-modal-title">
              <span className="sp-brand-dot" />
              เริ่ม Session ใหม่
            </div>
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0.4rem 0 1.5rem' }}>ระบุชื่อทีมหรือผู้แข่งขัน เพื่อเก็บข้อมูลแยกแต่ละ session</p>
            <div className="sp-field-label">ชื่อทีม / ผู้แข่งขัน <span style={{ color: 'var(--orange)' }}>*</span></div>
            <input
              type="text" className="sp-field-input" placeholder="เช่น ทีม Alpha, นาย สมชาย..."
              style={{ height: 42, fontSize: 14 }}
              value={pendingSession.teamName}
              onChange={e => setPendingSession(s => ({ ...s, teamName: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') startSession() }}
              autoFocus
            />
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Session ID:</span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--text3)' }}>{pendingSession.id}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
              <button className="sp-btn-sm" style={{ flex: 1 }} onClick={() => setShowModal(false)}>ข้ามไปก่อน</button>
              <button className="sp-btn-sm primary" style={{ flex: 2, padding: 10, fontSize: 14 }} onClick={startSession}>▶ เริ่ม Session</button>
            </div>
          </div>
        </div>

        {/* ── TOAST ── */}
        <div className={`sp-toast${toast.show ? ' show' : ''}`}>
          <span className="sp-toast-icon">{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      </div>
    </>
  )
}

// ── MESSAGE BUBBLE COMPONENT ─────────────────────────────────────────────────
function MessageBubble({ msg, contestant, onReplay }) {
  if (!msg.text && msg.badge?.type === 'score') {
    return <ScoreCard data={msg.badge.data} scoreColor={msg.badge.scoreColor} time={msg.time} />
  }
  if (msg.role === 'ai') {
    return (
      <div className="sp-msg ai">
        <div className="sp-msg-avatar ai">
          <img src="/Besties.png" alt="AI" onError={e => (e.target.parentElement.textContent = 'B')} />
        </div>
        <div>
          {msg.badge?.type === 'admin' && (
            <div style={{ display: 'inline-block', background: 'rgba(232,92,13,0.1)', border: '1px solid rgba(232,92,13,0.25)', color: 'var(--orange)', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginBottom: 5, letterSpacing: '0.4px' }}>
              🎙️ ADMIN
            </div>
          )}
          <div className="sp-msg-bubble">{msg.text}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, marginLeft: 2 }}>
            <div className="sp-msg-time" style={{ marginTop: 0 }}>{msg.time}</div>
            <button className="sp-replay-btn" onClick={() => onReplay(msg.text)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              พูดซ้ำ
            </button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="sp-msg user">
      <div className="sp-msg-avatar user">{contestant}</div>
      <div>
        <div className="sp-msg-bubble">{msg.text}</div>
        <div style={{ marginTop: 6 }}>
          <span className="sp-kb-tag"><span style={{ width: 5, height: 5, background: 'var(--green)', borderRadius: '50%', display: 'inline-block' }} />บันทึกแล้ว</span>
        </div>
        <div className="sp-msg-time">{msg.time}</div>
      </div>
    </div>
  )
}

function ScoreCard({ data, scoreColor, time }) {
  const b = data?.breakdown || {}
  const score = data?.totalScore || 0
  const rows = [
    { label: 'ความคิดสร้างสรรค์', key: 'creativity',  max: 25 },
    { label: 'ความเป็นไปได้',     key: 'feasibility', max: 25 },
    { label: 'ความชัดเจน',        key: 'clarity',     max: 25 },
    { label: 'ผลกระทบ',           key: 'impact',      max: 25 },
  ]
  return (
    <div className="sp-msg ai">
      <div className="sp-msg-avatar ai">
        <img src="/Besties.png" alt="AI" onError={e => (e.target.parentElement.textContent = 'B')} />
      </div>
      <div style={{ maxWidth: '85%' }}>
        <div style={{ display: 'inline-block', background: 'rgba(45,122,58,0.15)', border: '1px solid rgba(45,122,58,0.3)', color: 'var(--green)', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, marginBottom: 6, letterSpacing: '0.4px' }}>
          📊 ANALYSIS RESULT
        </div>
        <div className="sp-score-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <div className="sp-score-label">ทีม</div>
              <div style={{ color: 'white', fontWeight: 600, fontSize: 15, marginTop: 2 }}>{data?.teamName || '—'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="sp-score-total" style={{ color: scoreColor }}>{score}</div>
              <div className="sp-score-label">/ 100 คะแนน</div>
            </div>
          </div>
          {rows.map(r => (
            <div className="sp-score-row" key={r.key}>
              <span style={{ color: 'rgba(255,255,255,0.55)', minWidth: 110, fontSize: 13 }}>{r.label}</span>
              <div className="sp-score-bar-wrap">
                <div className="sp-score-bar-fill" style={{ width: `${Math.round(((b[r.key] || 0) / r.max) * 100)}%` }} />
              </div>
              <span className="sp-score-val">{b[r.key] || 0}/{r.max}</span>
            </div>
          ))}
          {data?.summary && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              {data.summary}
            </div>
          )}
        </div>
        <div className="sp-msg-time">{time}</div>
      </div>
    </div>
  )
}
