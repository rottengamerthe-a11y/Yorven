import React, { useEffect, useRef, useState, useMemo } from 'react'
import './GradientBackground.css'

/**
 * GLSL Prelude: shared uniforms and color math in OKLab
 */
const PRELUDE = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uResolution;   // device pixels
uniform float uTime;        // seconds, scaled by speed
uniform float uPixelRatio;  // device pixels per CSS pixel
uniform vec3 uPointer;      // xy: device pixels from bottom-left, eased; z: 0-1 while over
uniform vec2 uPointerMove;  // velocity, device pixels per second
uniform vec4 uPulses[4];    // presses: xy, age in seconds, alive 0/1
uniform float uIntro;       // eases 0-1 on first show
uniform vec3 uSurface;      // surface color behind canvas, sRGB
uniform float uDark;        // 1 on dark surface, 0 on light
uniform float uGrain;
uniform sampler2D uState;
uniform sampler2D uAtlas;
uniform float uAtlasCount;
out vec4 outColor;

#define PI 3.141592653589793
#define TAU 6.283185307179586

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
vec3 hash32(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
mat2 rotate(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), w.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), w.x), w.y);
}

vec3 permute(vec3 x) { return mod((x * 34.0 + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)), x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1, 0) : vec2(0, 1);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0, i1.y, 1)) + i.x + vec3(0, i1.x, 1));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m *= m; m *= m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0, h = abs(x) - 0.5, a0 = x - floor(x + 0.5);
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  return 130.0 * dot(m, vec3(a0.x * x0.x + h.x * x0.y, a0.yz * x12.xz + h.yz * x12.yw));
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * snoise(p);
    p = rotate(0.6) * p * 2.02 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toOklab(vec3 c) {
  vec3 l = toLinear(c);
  vec3 lms = pow(max(mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * l, 0.0), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
vec3 fromOklab(vec3 c) {
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * c;
  lms *= lms * lms;
  return toSrgb(mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * lms);
}
vec3 mixColor(vec3 a, vec3 b, float t) { return fromOklab(mix(toOklab(a), toOklab(b), t)); }

vec3 ramp(vec3 colors[8], int count, float t) {
  float x = clamp(t, 0.0, 1.0) * float(max(count - 1, 1));
  int i = int(min(floor(x), float(max(count - 2, 0))));
  return mixColor(colors[i], colors[min(i + 1, count - 1)], smoothstep(0.0, 1.0, x - float(i)));
}

vec3 loopRamp(vec3 colors[8], int count, float t) {
  float x = fract(t) * float(count);
  int i = int(floor(x)) % count;
  return mixColor(colors[i], colors[(i + 1) % count], smoothstep(0.0, 1.0, fract(x)));
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 glow(vec3 color, float amount) {
  float a = clamp(amount, 0.0, 1.0);
  vec3 lit = min(color * max(amount, 0.0), 1.0);
  return mix(vec4(color * a, a), vec4(lit, max(lit.r, max(lit.g, lit.b))), uDark);
}

vec4 paint(vec3 color, float amount) { float a = clamp(amount, 0.0, 1.0); return vec4(color * a, a); }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

vec2 centered(vec2 frag) { return (frag - 0.5 * uResolution) / uPixelRatio; }
vec2 uvOf(vec2 frag) { return frag / uResolution; }
vec2 fitted(vec2 frag) { return (frag - 0.5 * uResolution) / min(uResolution.x, uResolution.y); }
`

/**
 * GLSL Main: handles dither, grain, and premultiplied color
 */
const MAIN = /* glsl */ `
void main() {
  vec4 c = scene(gl_FragCoord.xy);
  float flick = fract(uTime * 7.31) * 61.7;
  float shown = step(0.002, max(c.a, luma(c.rgb)));
  c += (hash21(gl_FragCoord.xy + flick) - 0.5) * (1.5 / 255.0) * shown;
  float g = (hash21(floor(gl_FragCoord.xy / max(uPixelRatio * 0.75, 1.0)) + flick) - 0.5) * uGrain * 0.34;
  float cover = max(-g, 0.0);
  c.rgb = c.rgb * (1.0 - cover) + max(g, 0.0);
  c.a += cover * (1.0 - c.a);
  c = clamp(c, 0.0, 1.0);
  c.a = max(c.a, max(c.r, max(c.g, c.b)));
  outColor = c;
}
`

const VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`

/**
 * GLSL Gradient scene: flowing noise-bent palette bands with OKLab tone mapping
 */
const GRADIENT_SCENE = /* glsl */ `
uniform vec3 uColors[8];
uniform int uColorsCount;
uniform float uAngle;
uniform float uContrast;
uniform float uDetail;
uniform float uFlow;
uniform float uIntensity;
uniform vec2 uOrigin;
uniform float uScale;
uniform float uSeed;
uniform float uSoftness;
uniform float uType;
uniform float uWarp;

vec3 tone(vec3 color) {
  vec3 lab = toOklab(color);
  float push = clamp(uIntensity - 1.0, 0.0, 1.0);
  float lo = mix(0.64, 0.0, push), hi = mix(0.545, 1.0, push);
  float lifted = 0.5 * (lab.x + lo + sqrt((lab.x - lo) * (lab.x - lo) + 0.004));
  float deep = lab.x * mix(0.86, 1.0, push);
  float lowered = 0.5 * (deep + hi - sqrt((deep - hi) * (deep - hi) + 0.004));
  float hue = atan(lab.z, lab.y + 1e-6);
  float warm = smoothstep(0.4, 0.85, hue) * (1.0 - smoothstep(1.8, 2.3, hue));
  float drop = max(lab.x - lowered, 0.0) * warm * uDark;
  float chroma = max(length(lab.yz), 1e-4);
  lab.yz = rotate(min(drop * 2.8, max(hue - 0.35, 0.0))) * lab.yz * clamp(0.2 / chroma, 1.0, 1.0 + drop * 2.4);
  lab.x = mix(lifted, lowered, uDark);
  return lab;
}

vec3 band(float t, float edge) {
  int last = max(uColorsCount - 1, 1);
  float x = (1.0 - abs(fract(t * 0.5) * 2.0 - 1.0)) * float(last);
  int i = int(min(floor(x), float(last - 1)));
  float soft = clamp(max(uSoftness, edge * float(last)) * 0.5, 0.0, 0.5);
  return mix(tone(uColors[i]), tone(uColors[min(i + 1, uColorsCount - 1)]), smoothstep(0.5 - soft, 0.5 + soft, x - float(i)));
}

vec4 scene(vec2 frag) {
  float side = min(uResolution.x, uResolution.y);
  vec2 box = uResolution / side;
  vec2 p = fitted(frag);
  float time = uTime * 0.04;
  vec2 dir = vec2(sin(uAngle), cos(uAngle));
  vec2 from = p - uOrigin * 0.5 * box;
  float r = max(length(from), 1e-4);
  float run, slope;
  if (uType < 0.5) {
    slope = uScale / (abs(dir.x) * box.x + abs(dir.y) * box.y);
    run = dot(p, dir) * slope + 0.5;
  } else if (uType < 1.5) {
    slope = uScale / length((0.5 + 0.5 * abs(uOrigin)) * box);
    run = r * slope;
  } else {
    float turns = 2.0 * max(floor(uScale + 0.5), 1.0);
    slope = turns / (TAU * max(r, 0.3));
    run = (atan(from.x, from.y) - uAngle) / TAU * turns;
  }
  vec2 q = p + uSeed * 5.3;
  float broad = snoise(q * 0.6 / max(uWarp, 1.0) + vec2(time, -time * 0.6));
  float fine = snoise(rotate(1.1) * q * 1.5 + vec2(-time * 0.9, time * 1.2) + broad * 0.4);
  vec2 away = p - (uPointer.xy - 0.5 * uResolution) / side;
  float bend = (broad * 0.24 * uWarp + fine * 0.07 * uDetail * min(uWarp, 1.0) + uPointer.z * 0.14 * exp(-dot(away, away) * 7.0)) * slope;
  float t = run + bend - uTime * 0.02 * uFlow + (1.0 - uIntro) * 0.3;
  float edge = slope / side + length(vec2(dFdx(bend), dFdy(bend)));
  vec3 lab = band(t, edge * 1.5);
  float glowLight = snoise(q * 0.35 + vec2(4.0 - time * 0.5, time * 0.3));
  float lit = smoothstep(0.0, 1.0, 0.5 + 0.2 * uDark - 0.5 * cos(2.0 * TAU * t + 1.6 * glowLight));
  float shade = (1.0 - lit) * uDark * uContrast / (0.6 + 0.4 * uContrast);
  lab.x *= 1.0 - 0.2 * shade;
  float thin = mix(lit * 0.25 * uContrast, shade * 0.6, uDark);
  float amount = min(uIntensity, 1.0) * clamp(1.0 - thin, 0.0, 1.0);
  return paint(fromOklab(lab), amount);
}
`

const QUAD = new Float32Array([-1, -1, 3, -1, -1, 3])
const ORIGINS = {
  bottom: [0, -1],
  center: [0, 0],
  left: [-1, 0],
  right: [1, 0],
  top: [0, 1],
}
const TYPES = { conic: 2, linear: 0, radial: 1 }

function hexToRgb01(hex) {
  if (!hex || typeof hex !== 'string') return [0, 0, 0]
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255
    const g = parseInt(clean[1] + clean[1], 16) / 255
    const b = parseInt(clean[2] + clean[2], 16) / 255
    return [r, g, b]
  }
  const num = parseInt(clean.substring(0, 6), 16)
  if (isNaN(num)) return [0, 0, 0]
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ]
}

function isReducedMotion() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ||
    document.documentElement?.dataset?.motion === 'reduced'
  )
}

/**
 * GradientBackground Component
 * Standalone WebGL2 shader background component (no Tailwind / PostCSS required).
 */
export function GradientBackground({
  type = 'linear',
  angle = 135,
  colors = ['#b9c4bf', '#1d3b35', '#0a1210', '#0f2a25'],
  scale = 1,
  warp = 1,
  softness = 1,
  flow = 0.4,
  speed = 0.6,
  grain = 0.45,
  contrast = 0.8,
  intensity = 1.0,
  detail = 0.5,
  origin = 'center',
  seed = 0,
  fade = 'none',
  interactive = true,
  quality = 0.75,
  paused = false,
  backgroundColor = '#0a1210',
  fallback = 'radial-gradient(circle at 15% 10%, rgba(185,196,191,0.13), transparent 50%), #0a1210',
  className = '',
  style = {},
  children,
}) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const [webglState, setWebglState] = useState('loading') // 'loading' | 'live' | 'still' | 'unsupported'

  // Ref to hold live mutable options
  const optionsRef = useRef({
    type,
    angle,
    colors,
    scale,
    warp,
    softness,
    flow,
    speed,
    grain,
    contrast,
    intensity,
    detail,
    origin,
    seed,
    interactive,
    quality,
    paused,
    backgroundColor,
  })

  useEffect(() => {
    optionsRef.current = {
      type,
      angle,
      colors,
      scale,
      warp,
      softness,
      flow,
      speed,
      grain,
      contrast,
      intensity,
      detail,
      origin,
      seed,
      interactive,
      quality,
      paused,
      backgroundColor,
    }
  }, [
    type,
    angle,
    colors,
    scale,
    warp,
    softness,
    flow,
    speed,
    grain,
    contrast,
    intensity,
    detail,
    origin,
    seed,
    interactive,
    quality,
    paused,
    backgroundColor,
  ])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas || typeof window === 'undefined') return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
      stencil: false,
    })

    if (!gl) {
      console.warn('[GradientBackground] WebGL2 not supported, falling back to CSS background.')
      setWebglState('unsupported')
      return
    }

    // Compile shader pass
    function compileProgram(vertSrc, fragSrc) {
      const p = gl.createProgram()
      const vs = gl.createShader(gl.VERTEX_SHADER)
      gl.shaderSource(vs, vertSrc)
      gl.compileShader(vs)
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(vs)
        gl.deleteShader(vs)
        throw new Error(err)
      }

      const fs = gl.createShader(gl.FRAGMENT_SHADER)
      gl.shaderSource(fs, fragSrc)
      gl.compileShader(fs)
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(fs)
        gl.deleteShader(fs)
        throw new Error(err)
      }

      gl.attachShader(p, vs)
      gl.attachShader(p, fs)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.bindAttribLocation(p, 0, 'aPosition')
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p))
      }
      return p
    }

    let program = null
    try {
      program = compileProgram(VERTEX, PRELUDE + GRADIENT_SCENE + MAIN)
    } catch (e) {
      console.warn('[GradientBackground] Shader compilation failed:', e)
      setWebglState('unsupported')
      return
    }

    // Quad geometry buffer
    const quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    // Cached uniform locations
    const uniformLocs = new Map()
    function getLoc(name) {
      if (!uniformLocs.has(name)) {
        uniformLocs.set(name, gl.getUniformLocation(program, name))
      }
      return uniformLocs.get(name)
    }

    let isDisposed = false
    let inView = true
    let isTabVisible = !document.hidden
    let rafId = 0
    let clock = 6.0 // start at still moment
    let lastTime = 0
    let boxW = root.clientWidth || 300
    let boxH = root.clientHeight || 150
    let ratio = 1
    let shownAt = 0

    // Pointer smoothing
    const pointer = { on: 0, tx: -1, ty: -1, vx: 0, vy: 0, x: -1, y: -1 }

    function onPointerMove(e) {
      if (!optionsRef.current.interactive || !inView || e.pointerType === 'touch') {
        pointer.tx = -1
        return
      }
      const b = root.getBoundingClientRect()
      const x = e.clientX - b.left
      const y = b.bottom - e.clientY
      if (x >= 0 && y >= 0 && x <= b.width && y <= b.height) {
        pointer.tx = x
        pointer.ty = y
      } else {
        pointer.tx = -1
        pointer.ty = -1
      }
    }

    function onPointerLeave() {
      pointer.tx = -1
      pointer.ty = -1
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave, { passive: true })

    // ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === root) {
          boxW = entry.contentRect.width || entry.target.clientWidth
          boxH = entry.contentRect.height || entry.target.clientHeight
          drawFrame(0)
        }
      }
    })
    ro.observe(root)

    // IntersectionObserver to pause rendering when offscreen
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === root) {
            inView = entry.isIntersecting
            if (inView && !rafId && shouldAnimate()) {
              lastTime = 0
              rafId = requestAnimationFrame(loop)
            }
          }
        }
      },
      { threshold: 0.05 }
    )
    io.observe(root)

    function onVisibilityChange() {
      isTabVisible = !document.hidden
      if (isTabVisible && inView && !rafId && shouldAnimate()) {
        lastTime = 0
        rafId = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    function shouldAnimate() {
      const opts = optionsRef.current
      return (
        !opts.paused &&
        (opts.speed ?? 1) !== 0 &&
        !isReducedMotion() &&
        isTabVisible &&
        inView
      )
    }

    function drawFrame(dt) {
      if (!gl || gl.isContextLost()) return

      const opts = optionsRef.current
      const reduced = isReducedMotion()

      // Canvas sizing with quality cap
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const q = Math.min(Math.max(opts.quality || 0.75, 0.25), 1.0)
      ratio = dpr * q

      const w = Math.max(1, Math.round(boxW * ratio))
      const h = Math.max(1, Math.round(boxH * ratio))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      gl.viewport(0, 0, w, h)
      gl.useProgram(program)

      // Pointer easing
      const here = pointer.tx >= 0
      const tx = here ? pointer.tx : boxW / 2
      const ty = here ? pointer.ty : boxH / 2
      if (pointer.x < 0) {
        pointer.x = tx
        pointer.y = ty
      }
      const k = 1 - Math.exp(-dt * 9)
      const dx = (tx - pointer.x) * k
      const dy = (ty - pointer.y) * k
      pointer.x += dx
      pointer.y += dy
      const rate = dt > 0 ? 1 / dt : 0
      pointer.vx += (dx * rate - pointer.vx) * k
      pointer.vy += (dy * rate - pointer.vy) * k
      pointer.on += ((here ? 1 : 0) - pointer.on) * (1 - Math.exp(-dt * 6))

      // Time & intro calculation
      if (!shownAt) {
        shownAt = reduced ? -1e9 : performance.now()
      }
      const introVal = reduced
        ? 1.0
        : Math.min((performance.now() - shownAt) / 1100, 1.0)
      const easedIntro = 1 - Math.pow(1 - introVal, 3)

      const currentTime = reduced ? 6.0 : clock

      // Uniforms
      gl.uniform2f(getLoc('uResolution'), w, h)
      gl.uniform1f(getLoc('uTime'), currentTime)
      gl.uniform1f(getLoc('uPixelRatio'), ratio)
      gl.uniform3f(getLoc('uPointer'), pointer.x * ratio, pointer.y * ratio, pointer.on)
      gl.uniform2f(getLoc('uPointerMove'), pointer.vx * ratio, pointer.vy * ratio)
      gl.uniform1f(getLoc('uIntro'), easedIntro)

      // Surface color (dark background)
      const surfaceRgb = hexToRgb01(opts.backgroundColor || '#0a1210')
      gl.uniform3f(getLoc('uSurface'), surfaceRgb[0], surfaceRgb[1], surfaceRgb[2])
      gl.uniform1f(getLoc('uDark'), 1.0) // dark mode surface
      gl.uniform1f(getLoc('uGrain'), opts.grain ?? 0.45)

      // Palette array uniforms (max 8 colors)
      const paletteArray = new Float32Array(24)
      const colorList = opts.colors || []
      const count = Math.min(colorList.length, 8)
      for (let i = 0; i < count; i++) {
        const rgb = hexToRgb01(colorList[i])
        paletteArray[i * 3 + 0] = rgb[0]
        paletteArray[i * 3 + 1] = rgb[1]
        paletteArray[i * 3 + 2] = rgb[2]
      }
      gl.uniform3fv(getLoc('uColors'), paletteArray)
      gl.uniform1i(getLoc('uColorsCount'), count)

      // Gradient specific uniforms
      const angleRad = ((opts.angle ?? 135) * Math.PI) / 180
      gl.uniform1f(getLoc('uAngle'), angleRad)
      gl.uniform1f(getLoc('uContrast'), opts.contrast ?? 0.8)
      gl.uniform1f(getLoc('uDetail'), opts.detail ?? 0.5)
      gl.uniform1f(getLoc('uFlow'), opts.flow ?? 0.4)
      gl.uniform1f(getLoc('uIntensity'), opts.intensity ?? 1.0)
      const orig = ORIGINS[opts.origin] || [0, 0]
      gl.uniform2f(getLoc('uOrigin'), orig[0], orig[1])
      gl.uniform1f(getLoc('uScale'), opts.scale ?? 1.0)
      gl.uniform1f(getLoc('uSeed'), opts.seed ?? 0)
      gl.uniform1f(getLoc('uSoftness'), opts.softness ?? 1.0)
      gl.uniform1f(getLoc('uType'), TYPES[opts.type] ?? 0)
      gl.uniform1f(getLoc('uWarp'), opts.warp ?? 1.0)

      // Render full screen triangle
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    function loop(nowMs) {
      if (isDisposed) return
      if (!shouldAnimate()) {
        rafId = 0
        setWebglState(isReducedMotion() ? 'still' : 'live')
        drawFrame(0)
        return
      }

      const dt = Math.min(nowMs - (lastTime || nowMs), 100) / 1000
      lastTime = nowMs
      clock += dt * (optionsRef.current.speed ?? 0.6)

      drawFrame(dt)
      setWebglState('live')
      rafId = requestAnimationFrame(loop)
    }

    // Initial draw
    drawFrame(0)
    setWebglState(isReducedMotion() ? 'still' : 'live')

    if (shouldAnimate()) {
      rafId = requestAnimationFrame(loop)
    }

    return () => {
      isDisposed = true
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      ro.disconnect()
      io.disconnect()
      if (program && gl) {
        gl.deleteProgram(program)
      }
      if (quadBuffer && gl) {
        gl.deleteBuffer(quadBuffer)
      }
    }
  }, [])

  const fadeClass = fade && fade !== 'none' ? `gb-fade-${fade}` : ''

  return (
    <div
      ref={rootRef}
      className={`gb-root ${fadeClass} ${className}`}
      data-state={webglState}
      style={{
        backgroundColor,
        ...style,
      }}
      aria-hidden="true"
    >
      {/* Fallback image / CSS background */}
      <div
        className="gb-fallback"
        style={{
          background: fallback,
        }}
      />
      {/* WebGL2 Canvas */}
      <canvas ref={canvasRef} className="gb-canvas" aria-hidden="true" />
      {children}
    </div>
  )
}
