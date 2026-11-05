/*
 * particleAssemble — the "reverse snap".
 *
 * Dust is released from the bottom edge of the compact card and builds the
 * expanded rectangle piece by piece, top row first. The caller reveals the
 * real card in step with the dust via onProgress. Pure canvas 2D.
 *
 * All coordinates are CSS pixels relative to the canvas' top-left corner.
 */

const DEFAULT_PALETTE = [
  ['#082d2c', 0.5],
  ['#103937', 0.22],
  ['#0d4540', 0.12],
  ['#17b86b', 0.07],
  ['#e5f58f', 0.06],
  ['#70cbd0', 0.03]
]

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c) }

function pickColor(palette, r) {
  let acc = 0
  for (let i = 0; i < palette.length; i++) {
    acc += palette[i][1]
    if (r <= acc) return i
  }
  return 0
}

export function assembleParticles(canvas, o) {
  const { source, target, width, height, duration = 1900, maxParticles = 4200, palette: PALETTE = DEFAULT_PALETTE, onProgress, onSettled } = o
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const cell = Math.max(5, Math.ceil(Math.sqrt((target.w * target.h) / maxParticles)))
  const cols = Math.ceil(target.w / cell)
  const rows = Math.ceil(target.h / cell)
  const n = cols * rows

  const sx = new Float32Array(n), sy = new Float32Array(n)
  const cx = new Float32Array(n), cy = new Float32Array(n)
  const tx = new Float32Array(n), ty = new Float32Array(n)
  const delay = new Float32Array(n), dur = new Float32Array(n)
  const phase = new Float32Array(n), amp = new Float32Array(n)
  const size0 = new Float32Array(n)
  const colorIdx = new Uint8Array(n)

  const rowDone = new Float32Array(rows) // when the last particle of each row has landed

  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, i++) {
      tx[i] = target.x + c * cell + cell / 2
      ty[i] = target.y + r * cell + cell / 2

      // Origin: a thin strip along the bottom edge ("feet") of the compact card.
      const spread = (Math.random() - 0.5) * 18
      sx[i] = Math.min(source.x + source.w - 4, Math.max(source.x + 4, tx[i] + spread))
      sy[i] = source.y + source.h - Math.random() * 5

      // Path: only ever downward, with a light sideways drift.
      cx[i] = (sx[i] + tx[i]) / 2 + 12 + (Math.random() - 0.3) * 56
      cy[i] = sy[i] + (ty[i] - sy[i]) * (0.25 + Math.random() * 0.25)

      // Rows are released one after another, top first; each particle flies briefly.
      const rowT = r / rows
      delay[i] = rowT * 0.52 + Math.random() * 0.06
      dur[i] = 0.16 + rowT * 0.1 + Math.random() * 0.04
      if (delay[i] + dur[i] > rowDone[r]) rowDone[r] = delay[i] + dur[i]

      phase[i] = Math.random() * Math.PI * 2
      amp[i] = 3 + Math.random() * 11
      size0[i] = 1.4 + Math.random() * 2.4
      colorIdx[i] = pickColor(PALETTE, Math.random())
    }
  }

  for (let r = 1; r < rows; r++) if (rowDone[r] < rowDone[r - 1]) rowDone[r] = rowDone[r - 1]

  const buckets = PALETTE.map(() => [])
  for (let k = 0; k < n; k++) buckets[colorIdx[k]].push(k)

  const FADE = 0.09 // landed dust dissolves into the card for this fraction of the timeline
  const finalSize = cell + 1
  let raf = 0
  let start = 0
  let cancelled = false
  let finished = false

  // How much of the target is built, in px from its top.
  function revealed(p) {
    let k = 0
    while (k < rows && rowDone[k] <= p) k++
    if (k >= rows) return target.h
    const prev = k > 0 ? rowDone[k - 1] : Math.max(0, rowDone[0] - 0.1)
    const frac = Math.min(1, Math.max(0, (p - prev) / Math.max(0.0001, rowDone[k] - prev)))
    return Math.min(target.h, (k + frac) * cell)
  }

  function frame(now) {
    if (cancelled) return
    if (!start) start = now
    const p = Math.min(1, (now - start) / duration)

    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    let alpha = 1
    for (let b = 0; b < buckets.length; b++) {
      ctx.fillStyle = PALETTE[b][0]
      const list = buckets[b]
      for (let j = 0; j < list.length; j++) {
        const k = list[j]
        const lt = (p - delay[k]) / dur[k]
        if (lt <= 0) continue
        let fade = 1
        if (lt >= 1) {
          fade = 1 - (p - delay[k] - dur[k]) / FADE
          if (fade <= 0) continue
        }
        const t = lt >= 1 ? 1 : lt
        const e = easeOutCubic(t)
        const u = 1 - e
        const env = 4 * e * (1 - e)
        const x = u * u * sx[k] + 2 * u * e * cx[k] + e * e * tx[k] + Math.sin(phase[k] + e * 6) * amp[k] * env
        const y = u * u * sy[k] + 2 * u * e * cy[k] + e * e * ty[k] + Math.cos(phase[k] * 1.7 + e * 5) * amp[k] * 0.6 * env
        const s = size0[k] + (finalSize - size0[k]) * smooth((t - 0.6) / 0.4)
        const a = t < 0.12 ? t / 0.12 : fade
        if (a !== alpha) { ctx.globalAlpha = a; alpha = a }
        ctx.fillRect(x - s / 2, y - s / 2, s, s)
      }
    }

    onProgress && onProgress(p >= 1 ? target.h : revealed(p))

    if (p >= 1) {
      if (!finished) {
        finished = true
        ctx.clearRect(0, 0, width, height)
        onSettled && onSettled()
      }
      return
    }
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)

  return function cancel() {
    cancelled = true
    cancelAnimationFrame(raf)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}