import { useRef, useCallback } from 'react'

export function useSTT({ onResult, onError } = {}) {
  const recRef     = useRef(null)
  const finalRef   = useRef('')
  const activeRef  = useRef(false)

  const build = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { onError?.('กรุณาใช้ Chrome เพื่อใช้งานไมโครโฟน'); return null }

    const r = new SR()
    r.lang = 'th-TH'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1

    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript
        else interim = e.results[i][0].transcript
      }
      onResult?.({ final: finalRef.current, interim })
    }

    r.onend = () => {
      if (activeRef.current) {
        try { r.start() } catch (_) {}
      }
    }

    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (activeRef.current) setTimeout(() => { try { r.start() } catch (_) {} }, 300)
    }

    return r
  }, [onResult, onError])

  const start = useCallback(() => {
    if (!recRef.current) recRef.current = build()
    if (!recRef.current) return
    finalRef.current = ''
    activeRef.current = true
    onResult?.({ final: '', interim: '' })
    try { recRef.current.start() } catch (_) {}
  }, [build, onResult])

  const stop = useCallback(() => {
    activeRef.current = false
    const text = finalRef.current.trim()
    finalRef.current = ''
    try { recRef.current?.stop() } catch (_) {}
    return text
  }, [])

  return { start, stop }
}
