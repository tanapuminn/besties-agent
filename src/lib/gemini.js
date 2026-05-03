export async function geminiChat({ key, prompt, context, userText, mode }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ role: 'user', parts: [{ text: `บริบท:\n${context}\n\nผู้ใช้: ${userText}` }] }],
        generationConfig: { temperature: mode === 'analyze' ? 0.65 : 0.82 },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }
  const data = await res.json()
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text
  if (!text) throw new Error('ไม่ได้รับ response จาก Gemini')
  return { text, truncated: candidate?.finishReason === 'MAX_TOKENS' }
}

export async function geminiTTS(text, key, voice = 'Alnilam') {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `TTS HTTP ${res.status}`)
  }
  const data = await res.json()
  const audioB64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!audioB64) throw new Error('TTS ไม่ได้รับ audio data')
  return pcmB64ToWavBlob(audioB64)
}

function pcmB64ToWavBlob(b64) {
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  const wav = pcmToWav(bytes, 24000, 1, 16)
  return new Blob([wav], { type: 'audio/wav' })
}

function pcmToWav(pcm, sr, ch, bd) {
  const dl = pcm.length
  const buf = new ArrayBuffer(44 + dl)
  const v = new DataView(buf)
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + dl, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * (bd / 8), true)
  v.setUint16(32, ch * (bd / 8), true); v.setUint16(34, bd, true)
  ws(36, 'data'); v.setUint32(40, dl, true)
  new Uint8Array(buf, 44).set(pcm)
  return buf
}
