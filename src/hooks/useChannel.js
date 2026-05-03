/**
 * useChannel — abstracts real-time messaging between System and Display pages.
 *
 * TWO MODES (configured via localStorage key "besties_channel_mode"):
 *
 *  "broadcast" (default)
 *    Uses BroadcastChannel API — works when both pages are open in the
 *    SAME browser (different tabs/windows, same origin). Perfect for
 *    local/same-device use.
 *
 *  "poll"
 *    Uses HTTP polling via n8n. System POSTs events to /besties-events,
 *    Display GETs /besties-events?after=<timestamp> every second.
 *    Works across different devices as long as both can reach n8n.
 *
 *    To enable: set localStorage "besties_channel_mode" = "poll"
 *    n8n needs a /besties-events endpoint (see README).
 */

import { useEffect, useRef } from 'react'

const CHANNEL_NAME = 'besties-display'

function getMode() {
  return localStorage.getItem('besties_channel_mode') || 'broadcast'
}

function getN8NBase() {
  const wh = localStorage.getItem('n8n_webhook') || ''
  return wh.replace(/\/$/, '').replace(/\/(besties-[^/]+)$/, '')
}

// ── HTTP polling helpers ──────────────────────────────────────────────────────

async function pollPost(base, event) {
  try {
    await fetch(`${base}/besties-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
  } catch (_) {}
}

async function pollGet(base, after) {
  try {
    const res = await fetch(`${base}/besties-events?after=${after}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.events) ? data.events : []
  } catch (_) {
    return []
  }
}

// ── hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {(msg: object) => void} onMessage  called for each received message
 * @returns {{ broadcast: (msg: object) => void }}
 */
export function useChannel(onMessage) {
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  const chRef   = useRef(null)   // BroadcastChannel instance
  const pollRef = useRef(null)   // polling interval id
  const lastTs  = useRef(Date.now())

  useEffect(() => {
    const mode = getMode()

    if (mode === 'poll') {
      const base = getN8NBase()
      if (!base) return
      pollRef.current = setInterval(async () => {
        const events = await pollGet(base, lastTs.current)
        for (const ev of events) {
          lastTs.current = Math.max(lastTs.current, ev._ts || 0)
          cbRef.current?.(ev)
        }
      }, 1000)
      return () => clearInterval(pollRef.current)
    }

    // broadcast mode (default)
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME)
      chRef.current = ch
      ch.onmessage = (e) => { if (e.data) cbRef.current?.(e.data) }
      return () => { ch.close(); chRef.current = null }
    } catch (_) {}
  }, [])

  function broadcast(msg) {
    const mode = getMode()
    if (mode === 'poll') {
      const base = getN8NBase()
      if (base) pollPost(base, { ...msg, _ts: Date.now() })
      return
    }
    try { chRef.current?.postMessage(msg) } catch (_) {}
    // persist session/score for cold-open restore
    if (msg.type === 'session' || msg.type === 'score') {
      try { localStorage.setItem('besties_display_' + msg.type, JSON.stringify(msg)) } catch (_) {}
    }
  }

  return { broadcast }
}
