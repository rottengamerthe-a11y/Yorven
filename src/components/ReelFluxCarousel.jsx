import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import * as THREE from 'three'
import { PROJECTS } from '../data/projects'
import './reel-flux-carousel.css'

/* ==========================================================================
   TUNABLE REEL FLUX CONSTANTS (One Source of Truth, Calibrated to Video)
   ========================================================================== */
// Sizing & Aspect-Ratio Geometry (Exact 43:24 aspect ratio matching 2752x1536 posters):
export const PANEL_ASPECT = 2752.0 / 1536.0 // Exact 43:24 aspect ratio matching 2752x1536 poster artwork
export const PANEL_GAP_RATIO = 0.018 // Video: 13px / 731px = 1.78% (Target: ~1.8% of panel width)
export const SCENE_SETS = 3 // Duplicate 4 projects across 3 sets (12 meshes) for seamless infinite loop with zero gaps

export function getPanelDimensions(viewportWidth, viewportHeight = (typeof window !== 'undefined' ? window.innerHeight : 900)) {
  const isMobile = viewportWidth <= 640
  let panelWidth, panelHeight

  if (isMobile) {
    // Mobile (375px): center panel ~82% width, neighbors peeking ~8%
    panelWidth = Math.round(viewportWidth * 0.82)
    panelHeight = Math.round(panelWidth / PANEL_ASPECT)
  } else {
    // Desktop:
    // Cap the centre panel at about 62% of viewport width at 1440px and wider
    const maxRatio = viewportWidth >= 1200 ? 0.62 : 0.76
    const maxWidth = Math.round(viewportWidth * maxRatio)

    // At 43:24 poster ratio with the same width, panel height scales proportionally
    const idealHeight = Math.round(viewportHeight * 0.54)
    let h = Math.max(260, Math.min(540, idealHeight))
    let w = Math.round(h * PANEL_ASPECT)
    if (w > maxWidth) {
      w = maxWidth
      h = Math.round(w / PANEL_ASPECT)
    }
    panelWidth = w
    panelHeight = h
  }

  // Canvas height provides ample clearance (+95%) for maximum wave (+22%) and edge curl (+38%)
  // Peak excursion reaches (0.5 * 1.38 + 0.22) * 2 = 1.82x panelHeight. 1.95x gives full safety headroom with zero clipping.
  const canvasHeight = Math.round(panelHeight * 1.95)
  const panelGap = Math.max(8, Math.round(panelWidth * PANEL_GAP_RATIO))
  const verticalBleed = Math.round((canvasHeight - panelHeight * 1.40) * 0.5)

  return { panelWidth, panelHeight, canvasHeight, panelGap, verticalBleed }
}

// Liquid Glass Edge & Rim Dispersion (TASK 2 Constants):
export const EDGE_CURL_START = 0.82 // Flat center across inner ~82% of half-screen (smooth C2 S-curve curl across outer 12-15% of width)
export const EDGE_CURL_AMOUNT = 0.38 // Symmetrical curl height expansion (+38% total panel height at screen edge)
export const RIM_WIDTH_PX = 3.0 // Crisp glass rim core width in screen pixels (~3px at 1440px)
export const RIM_OFFSET_PX = 1.5 // Chromatic dispersion amber offset in screen pixels (~1.5px)
export const RIM_COLOR_CORE = [0.72, 0.90, 1.00] // Pale cyan-white core rim line
export const RIM_COLOR_DISPERSION = [1.00, 0.68, 0.38] // Faint warm amber/orange chromatic dispersion line
export const REFRACTION_AMOUNT = 0.0 // 0.0: No distortion on artwork (crisp, undistorted textures)
export const SPECULAR_AMOUNT = 0.08 // Soft specular highlight along curl

// Ambient Living Idle Wave & Dynamic Drag Wave Physics:
export const IDLE_WAVE_AMP = 0.03 // Slow ambient idle wave: ~3% of panel height (settles here on release)
export const IDLE_WAVE_SPEED = 0.85 // Ambient wave drift speed (period ~6-8s)
export const IDLE_WAVE_LENGTH = 1.10 // Ambient wave wavelength ratio relative to panel width

export const WAVE_MAIN_AMP = 0.10 // Typical drag wave amplitude (~10% of panel height)
export const MAX_AMPLITUDE = 0.22 // Hard flick clamp at 90th percentile (~22% of panel height)
export const WAVE_SECOND_AMP = 0.35 // Second harmonic amplitude ratio (35% of main)
export const WAVE_SECOND_RATIO = 0.63 // Second harmonic non-integer wavelength ratio (0.63x main)
export const ENVELOPE_AMOUNT = 0.40 // Amplitude envelope modulation depth (0.60 to 1.0)
export const PANEL_PHASE_JITTER = 0.35 // Maximum phase jitter per panel in radians (~0.35 rad)
export const PROPAGATION_DELAY = 0.060 // Staggered outward propagation delay (~60ms per panel stride)
export const BREATHING = 0.02 // Subtle vertical breathing up to 2% tied to velocity

export const WAVE_LENGTH_RATIO = 1.10 // Main wavelength: 1.10x panel width
export const VELOCITY_GAIN = 0.00075 // Smooth tanh gain mapping velocity into amplitude
export const SETTLE_DAMPING = 5.0 // Settles in ~0.60s (critically damped: exp(-5.0 * 0.60) = 0.049)
export const SCROLL_DAMPING = 9.0 // Smooth spring scroll inertia

/* ==========================================================================
   Helper: Accent Placeholder Texture (Ensures NO Black Panels)
   ========================================================================== */
function createAccentPlaceholderTexture(hexColor) {
  if (typeof document === 'undefined') return new THREE.Texture()
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 10
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = hexColor || '#10b981'
    ctx.fillRect(0, 0, 16, 10)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.flipY = true
  tex.needsUpdate = true
  return tex
}

/* ==========================================================================
   GLSL SHADERS (Liquid Glass Edge Curl, Rim Dispersion & Non-Repetitive Wave)
   ========================================================================== */
const vertexShader = `
  uniform float uScreenWidth;
  uniform float uPanelCenterOffset;
  uniform float uWaveAmp;
  uniform float uWaveLength;
  uniform float uWavePhase;
  uniform float uWaveSecondPhase;
  uniform float uWaveSecondRatio;
  uniform float uWaveSecondAmp;
  uniform float uEnvelopeAmount;
  uniform float uPanelPhaseJitter;
  uniform float uStride;
  uniform float uDragOriginX;
  uniform float uPropagationFactor;
  uniform float uBreathingFactor;
  uniform float uCenterLagX;
  uniform float uEdgeCurlStart;
  uniform float uEdgeCurlAmount;
  uniform vec2 uMouseTilt;
  uniform float uIsCenter;

  varying vec2 vUv;
  varying float vScreenX;
  varying float vCurlFactor;
  varying float vCenterFactor;

  // Ken Perlin's C2 smootherstep for seamless C2 curvature without kinks
  float smootherstep(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  void main() {
    vUv = uv;

    // 1. Center lag in drag direction (springs back as velocity settles)
    float rawWorldX = position.x + uPanelCenterOffset;
    float centerWeight = 1.0 - smoothstep(0.0, uScreenWidth * 0.55, abs(rawWorldX));
    float lagX = uCenterLagX * centerWeight;
    float worldX = rawWorldX + lagX;

    // Normalised screen X in [-1.5, 1.5] relative to viewport center
    float halfScreenW = uScreenWidth * 0.5;
    float normScreenX = clamp(worldX / halfScreenW, -1.5, 1.5);
    vScreenX = normScreenX;

    // Center factor for hover interactions
    vCenterFactor = smoothstep(uScreenWidth * 0.40, 0.0, abs(worldX));

    // 2. Interactive mouse tilt on center active panel
    vec3 pos = position;
    if (uIsCenter > 0.5) {
      pos.z += uMouseTilt.x * pos.x * 0.02 - uMouseTilt.y * pos.y * 0.02;
    }

    // 3. Vertical scale breathing (up to 2%) tied to drag velocity
    pos.y *= (1.0 + uBreathingFactor);

    // 4. Smooth S-curve edge curl across outer 12-15% of screen width (smootherstep C2 continuity)
    float normX = abs(normScreenX);
    float curlFactor = smootherstep(uEdgeCurlStart, 1.0, normX);
    vCurlFactor = curlFactor;
    float flaredY = pos.y * (1.0 + curlFactor * uEdgeCurlAmount);

    // 5. Multi-Harmonic Non-Repetitive Travelling Wave:
    float panelCoord = worldX / uStride;
    float p0 = floor(panelCoord);
    float p1 = p0 + 1.0;
    float fInterp = smoothstep(0.0, 1.0, fract(panelCoord));

    float hAmp0 = fract(sin(p0 * 127.1 + 311.7) * 43758.5453);
    float hAmp1 = fract(sin(p1 * 127.1 + 311.7) * 43758.5453);
    float ampMult = mix(0.85 + 0.30 * hAmp0, 0.85 + 0.30 * hAmp1, fInterp);

    float hPhase0 = fract(sin(p0 * 269.5 + 183.3) * 43758.5453);
    float hPhase1 = fract(sin(p1 * 269.5 + 183.3) * 43758.5453);
    float phaseJitter = mix((hPhase0 - 0.5) * 2.0 * uPanelPhaseJitter, (hPhase1 - 0.5) * 2.0 * uPanelPhaseJitter, fInterp);

    float distFromDrag = abs(worldX - uDragOriginX);
    float propagationLag = distFromDrag * uPropagationFactor;

    float envPhase = worldX / (uStride * 3.4);
    float envelope = 1.0 - uEnvelopeAmount * 0.5 * (1.0 + sin(envPhase * 6.2831853));

    float k1 = 6.28318530718 / uWaveLength;
    float w1 = sin(k1 * worldX + uWavePhase + phaseJitter - propagationLag);

    float k2 = 6.28318530718 / (uWaveLength * uWaveSecondRatio);
    float w2 = uWaveSecondAmp * sin(k2 * worldX + uWaveSecondPhase + phaseJitter * 1.37 - propagationLag * 1.25);

    float waveY = uWaveAmp * ampMult * envelope * (w1 + w2);

    // Final vertex position: straight vertical seam along X, flared + wavy Y, subtle tilt Z
    vec3 finalPos = vec3(worldX, flaredY + waveY, pos.z);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = `
  precision highp float;

  uniform sampler2D uTexture;
  uniform sampler2D uPlaceholder;
  uniform float uTextureLoaded;
  uniform float uImageAspect;
  uniform float uPanelAspect;
  uniform vec2 uPanelSize;
  uniform float uSweepProgress;
  uniform float uSweepOpacity;
  uniform float uIsCenter;

  // Liquid glass rim uniforms (zero UV refraction distortion)
  uniform float uRimWidthPx;
  uniform float uRimOffsetPx;
  uniform vec3 uRimColorCore;
  uniform vec3 uRimColorDispersion;
  uniform float uSpecularAmount;

  varying vec2 vUv;
  varying float vScreenX;
  varying float vCurlFactor;
  varying float vCenterFactor;

  // Anti-aliased rounded box signed distance field
  float roundedBoxSDF(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b + vec2(r);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
  }

  void main() {
    // 1. Direct 1:1 texture mapping (mesh is precisely sized to 2752x1536 poster aspect, no crop/scaling)
    vec2 st = vUv;
    vec4 texColor = texture2D(uTexture, st);
    vec4 placeholderColor = texture2D(uPlaceholder, st);
    vec4 color = mix(placeholderColor, texColor, clamp(uTextureLoaded, 0.0, 1.0));

    // 2. Rounded corners (6px radius matching reference) with anti-aliasing
    float r = 6.0;
    vec2 halfSize = uPanelSize * 0.5;
    vec2 pixelPos = (vUv - 0.5) * uPanelSize;
    float d = roundedBoxSDF(pixelPos, halfSize, r);
    float alpha = 1.0 - smoothstep(0.0, 1.8, d);

    if (alpha <= 0.001) discard;

    // Full vivid panel color right to the edge — no dark vignette, no blur
    vec3 finalRgb = color.rgb;

    // 3. Crisp Liquid Glass Rim along top & bottom curled contours
    if (vCurlFactor > 0.001) {
      // True screen-pixel distance from the nearest horizontal edge (top or bottom)
      float edgeDistUv = min(vUv.y, 1.0 - vUv.y);
      float fwy = max(fwidth(vUv.y), 0.00005);
      float distPx = edgeDistUv / fwy;

      // a) Pale cyan-white core line: crisp 3px screen-space line
      float core = smoothstep(uRimWidthPx, 0.0, distPx);

      // b) Amber chromatic dispersion line: offset 1.5px right beside the core line
      float dispCenter = uRimWidthPx * 0.75 + uRimOffsetPx;
      float amber = smoothstep(uRimWidthPx * 0.75, 0.0, abs(distPx - dispCenter));

      // c) Graceful corner taper so rim follows rounded corner without hard cut at panel ends
      float cornerFade = smoothstep(0.0, 0.04, min(vUv.x, 1.0 - vUv.x));
      float rimRamp = smoothstep(0.0, 0.6, vCurlFactor) * cornerFade;

      finalRgb = mix(finalRgb, uRimColorDispersion, amber * 0.85 * rimRamp);
      finalRgb = mix(finalRgb, uRimColorCore, core * 0.90 * rimRamp);
      finalRgb += uRimColorCore * (core * 0.35 * rimRamp);

      // d) Soft specular brightening (8-10%) on curling surface facing light
      float specular = vCurlFactor * smoothstep(14.0, 0.0, distPx) * uSpecularAmount * cornerFade;
      finalRgb += finalRgb * specular;
    }

    // 4. Subtle center hover sheen (Wide diagonal band, ~40% width, soft smoothstep falloff, 12% max opacity)
    if (uSweepOpacity > 0.0001 && uIsCenter > 0.5) {
      float diag = vUv.x * 0.70 + vUv.y * 0.30;
      float dist = abs(diag - uSweepProgress);
      float sweep = smoothstep(0.20, 0.0, dist);
      finalRgb += vec3(1.0, 1.0, 1.0) * (sweep * uSweepOpacity);
    }

    gl_FragColor = vec4(finalRgb, alpha * color.a);
  }
`

export function ReelFluxCarousel({
  projects = PROJECTS,
  eyebrow = 'Selected work'
}) {
  const navigate = useNavigate()
  const sectionRef = useRef(null)
  const canvasContainerRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isReduced, setIsReduced] = useState(false)
  const [isSectionVisible, setIsSectionVisible] = useState(false)
  const [hasEnteredNear, setHasEnteredNear] = useState(false)
  const [dimensions, setDimensions] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440
    const h = typeof window !== 'undefined' ? window.innerHeight : 900
    return getPanelDimensions(w, h)
  })

  // Continuous reel animation state
  const scrollRef = useRef(0.0) // current continuous scroll offset in pixels
  const prevScrollRef = useRef(0.0) // scroll position in previous frame for velocity
  const targetScrollRef = useRef(0.0) // target snap scroll in pixels
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartScrollRef = useRef(0)
  const dragDistanceRef = useRef(0)
  const velocityRef = useRef(0)
  const lastPointerXRef = useRef(0)
  const lastPointerTimeRef = useRef(0)

  // Dynamic wave physics state
  const waveAmpRef = useRef(0.0) // current wave amplitude in pixels
  const wavePhaseRef = useRef(0.0) // travelling wave phase angle
  const waveSecondPhaseRef = useRef(0.0) // second harmonic travelling phase angle
  const idlePhaseRef = useRef(0.0) // ambient living idle wave phase
  const breathingRef = useRef(0.0) // vertical breathing factor
  const centerLagRef = useRef(0.0) // center line lag in pixels
  const dragOriginXRef = useRef(0.0) // drag origin X coordinate in pixels

  // Hover & sweep
  const mouseTiltRef = useRef({ x: 0, y: 0 })
  const sweepProgressRef = useRef(-0.35)
  const sweepOpacityRef = useRef(0.0)
  const isHoveredRef = useRef(false)
  const autoPlayTimerRef = useRef(null)

  // Three.js scene refs
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const meshesRef = useRef([])
  const texturesRef = useRef([])
  const textureStatusRef = useRef([]) // Array of { loaded: boolean, loading: boolean, opacity: number }
  const mouseCoordsRef = useRef(new THREE.Vector2())

  const count = projects.length

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setIsReduced(mq.matches)
    const handler = (e) => setIsReduced(e.matches)
    if (mq.addEventListener) {
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [])

  // Near-viewport tracking to defer Three.js instantiation until user scrolls near (rootMargin: 100px)
  useEffect(() => {
    if (!sectionRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsSectionVisible(entry.isIntersecting)
          if (entry.isIntersecting) {
            setHasEnteredNear(true)
          }
        })
      },
      { threshold: 0.05, rootMargin: '100px 0px' }
    )
    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  /* ==========================================================================
     Texture Loader Function with Mipmaps, Anisotropy, sRGB & Mobile 2048 Cap
     ========================================================================== */
  const loadSingleTexture = useCallback((pIdx, isMobile, maxAnisotropy) => {
    if (!textureStatusRef.current[pIdx]) {
      textureStatusRef.current[pIdx] = { loaded: false, loading: false, opacity: 0.0 }
    }
    const status = textureStatusRef.current[pIdx]
    if (status.loaded || status.loading) return

    status.loading = true
    const project = projects[pIdx]
    if (!project) return
    const imageLoader = new THREE.ImageLoader()

    imageLoader.load(
      project.media,
      (image) => {
        let finalSource = image
        // 1440 texture cap on desktop, 1024 on mobile for ultra-fast GPU upload without main-thread freeze
        const maxDim = isMobile ? 1024 : 1440
        if (image.width > maxDim || image.height > maxDim) {
          const scale = maxDim / Math.max(image.width, image.height)
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(image.width * scale)
          canvas.height = Math.round(image.height * scale)
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
            finalSource = canvas
          }
        }

        const tex = new THREE.Texture(finalSource)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.flipY = true
        // High-performance hardware bilinear filtering (no CPU/GPU mipmap generation freeze)
        tex.generateMipmaps = false
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.anisotropy = Math.min(maxAnisotropy, 4)
        tex.needsUpdate = true

        texturesRef.current[pIdx] = tex
        status.loaded = true
        status.loading = false

        // Update all meshes in scene that display this project
        meshesRef.current.forEach((mesh) => {
          if (mesh.userData.projectIndex === pIdx && mesh.material) {
            mesh.material.uniforms.uTexture.value = tex
            mesh.material.needsUpdate = true
          }
        })
      },
      undefined,
      (err) => {
        status.loading = false
        console.error(`[ReelFluxCarousel] Failed to load texture for ${project.title} (${project.media}):`, err)
      }
    )
  }, [projects])

  /* ==========================================================================
     Three.js WebGL Scene Initialization
     ========================================================================== */
  useEffect(() => {
    if (isReduced || !canvasContainerRef.current || !hasEnteredNear) return

    const container = canvasContainerRef.current
    const width = container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1440)
    const viewH = typeof window !== 'undefined' ? window.innerHeight : 900
    const dims = getPanelDimensions(width, viewH)
    const { panelWidth, panelHeight, canvasHeight: initCanvasH } = dims
    const isMobile = width <= 640

    container.style.height = `${initCanvasH}px`
    container.style.marginTop = `-${dims.verticalBleed}px`
    container.style.marginBottom = `-${dims.verticalBleed}px`
    setDimensions(dims)
    const height = initCanvasH

    // 1. Scene & Camera (1 unit = 1 pixel at z = 0)
    const scene = new THREE.Scene()
    sceneRef.current = scene

    const fov = 32.0
    const camera = new THREE.PerspectiveCamera(fov, width / height, 10, 5000)
    const cameraDistance = (height / 2.0) / Math.tan((fov * Math.PI) / 360.0)
    camera.position.set(0, 0, cameraDistance)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 2. High-Quality WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setClearColor(0x0a1210, 1.0)
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    rendererRef.current = renderer

    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // 3. Texture Initialization & Accent Placeholders
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy() || 4
    textureStatusRef.current = projects.map(() => ({ loaded: false, loading: false, opacity: 0.0 }))

    const placeholders = projects.map((p) => createAccentPlaceholderTexture(p.accentColor))
    texturesRef.current = [...placeholders]

    // 4. Build Panel Meshes with Dense PlaneGeometry (48x24 for smooth wave & flare)
    // Duplicated across SCENE_SETS for continuous infinite loop with no gap
    const waveLengthPx = panelWidth * WAVE_LENGTH_RATIO
    const geometry = new THREE.PlaneGeometry(panelWidth, panelHeight, 48, 24)
    const totalMeshes = count * SCENE_SETS

    const meshes = []
    for (let i = 0; i < totalMeshes; i++) {
      const pIdx = i % count
      const project = projects[pIdx]
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTexture: { value: placeholders[pIdx] },
          uPlaceholder: { value: placeholders[pIdx] },
          uTextureLoaded: { value: 0.0 },
          uScreenWidth: { value: width },
          uPanelCenterOffset: { value: 0.0 },
          uWaveAmp: { value: 0.0 },
          uWaveLength: { value: waveLengthPx },
          uWavePhase: { value: 0.0 },
          uWaveSecondPhase: { value: 0.0 },
          uWaveSecondRatio: { value: WAVE_SECOND_RATIO },
          uWaveSecondAmp: { value: WAVE_SECOND_AMP },
          uEnvelopeAmount: { value: ENVELOPE_AMOUNT },
          uPanelPhaseJitter: { value: PANEL_PHASE_JITTER },
          uStride: { value: panelWidth + dims.panelGap },
          uDragOriginX: { value: 0.0 },
          uPropagationFactor: { value: (PROPAGATION_DELAY * 2.0 * Math.PI) / (panelWidth + dims.panelGap) },
          uBreathingFactor: { value: 0.0 },
          uCenterLagX: { value: 0.0 },
          uEdgeCurlStart: { value: EDGE_CURL_START },
          uEdgeCurlAmount: { value: EDGE_CURL_AMOUNT },
          uRimWidthPx: { value: RIM_WIDTH_PX },
          uRimOffsetPx: { value: RIM_OFFSET_PX },
          uRimColorCore: { value: new THREE.Color(...RIM_COLOR_CORE) },
          uRimColorDispersion: { value: new THREE.Color(...RIM_COLOR_DISPERSION) },
          uSpecularAmount: { value: SPECULAR_AMOUNT },
          uPanelSize: { value: new THREE.Vector2(panelWidth, panelHeight) },
          uImageAspect: { value: PANEL_ASPECT }, // 16:9 aspect ratio matching 2752x1536 artwork
          uPanelAspect: { value: panelWidth / panelHeight },
          uMouseTilt: { value: new THREE.Vector2(0, 0) },
          uSweepProgress: { value: -0.5 },
          uSweepOpacity: { value: 0.0 },
          uIsCenter: { value: i === 0 ? 1.0 : 0.0 }
        },
        transparent: true,
        side: THREE.DoubleSide
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData = { meshIndex: i, projectIndex: pIdx, href: project.href }
      scene.add(mesh)
      meshes.push(mesh)
    }
    meshesRef.current = meshes

    // 5. Preload initial 2 panels (projects 0 and 1)
    loadSingleTexture(0, isMobile, maxAnisotropy)
    loadSingleTexture(1, isMobile, maxAnisotropy)

    // 6. Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return
      const newW = container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1440)
      const newViewH = typeof window !== 'undefined' ? window.innerHeight : 900
      const newDims = getPanelDimensions(newW, newViewH)
      const { panelWidth: newPWidth, panelHeight: newPHeight, canvasHeight: newCanvasH } = newDims

      container.style.height = `${newCanvasH}px`
      container.style.marginTop = `-${newDims.verticalBleed}px`
      container.style.marginBottom = `-${newDims.verticalBleed}px`
      setDimensions(newDims)

      camera.aspect = newW / newCanvasH
      const newDist = (newCanvasH / 2.0) / Math.tan((fov * Math.PI) / 360.0)
      camera.position.set(0, 0, newDist)
      camera.updateProjectionMatrix()
      renderer.setSize(newW, newCanvasH)

      const newWaveLength = newPWidth * WAVE_LENGTH_RATIO
      const newStride = newPWidth + newDims.panelGap
      const newPropagation = (PROPAGATION_DELAY * 2.0 * Math.PI) / newStride
      const newGeo = new THREE.PlaneGeometry(newPWidth, newPHeight, 48, 24)
      meshesRef.current.forEach((mesh) => {
        mesh.geometry.dispose()
        mesh.geometry = newGeo
        mesh.material.uniforms.uScreenWidth.value = newW
        mesh.material.uniforms.uWaveLength.value = newWaveLength
        mesh.material.uniforms.uStride.value = newStride
        mesh.material.uniforms.uPropagationFactor.value = newPropagation
        mesh.material.uniforms.uEdgeCurlStart.value = EDGE_CURL_START
        mesh.material.uniforms.uEdgeCurlAmount.value = EDGE_CURL_AMOUNT
        mesh.material.uniforms.uRimWidthPx.value = RIM_WIDTH_PX
        mesh.material.uniforms.uRimOffsetPx.value = RIM_OFFSET_PX
        mesh.material.uniforms.uSpecularAmount.value = SPECULAR_AMOUNT
        mesh.material.uniforms.uPanelSize.value.set(newPWidth, newPHeight)
        mesh.material.uniforms.uPanelAspect.value = newPWidth / newPHeight
      })
    }

    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (renderer) renderer.dispose()
      if (geometry) geometry.dispose()
      placeholders.forEach((t) => t.dispose())
      texturesRef.current.forEach((t) => {
        if (t && t.dispose) t.dispose()
      })
      meshes.forEach((m) => {
        if (m.material) m.material.dispose()
      })
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [isReduced, hasEnteredNear, projects, count, loadSingleTexture])

  /* ==========================================================================
     Animation & Dynamic Wave Physics Loop
     ========================================================================== */
  useEffect(() => {
    if (isReduced) return

    let animId = 0
    let lastTime = performance.now()

    const loop = (now) => {
      animId = requestAnimationFrame(loop)

      if (!isSectionVisible || !rendererRef.current || !sceneRef.current || !cameraRef.current) {
        return
      }

      const dt = Math.min(0.064, (now - lastTime) / 1000.0)
      lastTime = now

      const container = canvasContainerRef.current
      const width = container ? container.clientWidth : 1440
      const viewH = typeof window !== 'undefined' ? window.innerHeight : 900
      const isMobile = width <= 640
      const dims = getPanelDimensions(width, viewH)
      const { panelWidth, panelHeight, panelGap } = dims
      const stride = panelWidth + panelGap
      const totalMeshes = count * SCENE_SETS
      const totalLength = totalMeshes * stride

      // 1. Smooth spring damping towards target scroll
      if (!isDraggingRef.current) {
        const diff = targetScrollRef.current - scrollRef.current
        scrollRef.current += diff * (1.0 - Math.exp(-SCROLL_DAMPING * dt))
        if (Math.abs(diff) < 0.2) {
          scrollRef.current = targetScrollRef.current
        }
      }

      // 2. Velocity computation & dynamic multi-harmonic wave amplitude
      const scrollDelta = scrollRef.current - prevScrollRef.current
      prevScrollRef.current = scrollRef.current
      const velocity = dt > 0 ? (scrollDelta / dt) : 0
      velocityRef.current = velocity

      // Ambient living idle wave (period ~6-8s):
      idlePhaseRef.current += dt * (2.0 * Math.PI / 7.0) * IDLE_WAVE_SPEED

      // Target wave amplitude:
      // Base idle amplitude = panelHeight * IDLE_WAVE_AMP (~3% of panel height)
      // Dynamic drag contribution up to panelHeight * MAX_AMPLITUDE (~22% on hard flick)
      const idleAmpPx = panelHeight * IDLE_WAVE_AMP
      const dynamicHeadroom = panelHeight * Math.max(0.0, MAX_AMPLITUDE - IDLE_WAVE_AMP)
      const targetWaveAmp = idleAmpPx + dynamicHeadroom * Math.tanh(Math.abs(velocity) * VELOCITY_GAIN)

      // Critically damped spring on wave amplitude: settles back to idleAmpPx in ~0.60s (SETTLE_DAMPING = 5.0)
      waveAmpRef.current += (targetWaveAmp - waveAmpRef.current) * (1.0 - Math.exp(-SETTLE_DAMPING * dt))
      if (IDLE_WAVE_AMP === 0.0 && Math.abs(waveAmpRef.current) < 0.05 && Math.abs(targetWaveAmp) < 0.05) {
        waveAmpRef.current = 0.0
      }

      // Wave phases: directionally driven by drag, plus slow ambient drift when idle
      const waveLengthPx = panelWidth * (WAVE_LENGTH_RATIO * IDLE_WAVE_LENGTH)
      const dragPhaseDelta = (scrollDelta / waveLengthPx) * (2.0 * Math.PI)
      const idlePhaseDelta = dt * (2.0 * Math.PI / 7.0) * IDLE_WAVE_SPEED
      wavePhaseRef.current += dragPhaseDelta + idlePhaseDelta * (1.0 - Math.min(1.0, Math.abs(velocity) * 0.002))

      const secondWaveLength = waveLengthPx * WAVE_SECOND_RATIO
      const dragSecondDelta = (scrollDelta / secondWaveLength) * (2.0 * Math.PI) * 1.18
      const idleSecondDelta = dt * (2.0 * Math.PI / (7.0 * WAVE_SECOND_RATIO)) * IDLE_WAVE_SPEED * 1.18
      waveSecondPhaseRef.current += dragSecondDelta + idleSecondDelta * (1.0 - Math.min(1.0, Math.abs(velocity) * 0.002))

      // Subtle vertical-scale breathing (up to 2%) tied to velocity
      const normVel = Math.tanh(Math.abs(velocity) * 0.001)
      const targetBreathing = BREATHING * normVel * 0.8
      breathingRef.current += (targetBreathing - breathingRef.current) * (1.0 - Math.exp(-SETTLE_DAMPING * dt))

      // Slight lag on the strip's center line (about 6px) in drag direction that springs back
      const dragDir = Math.sign(velocity)
      const targetLag = -dragDir * Math.min(6.0, 6.0 * normVel)
      centerLagRef.current += (targetLag - centerLagRef.current) * (1.0 - Math.exp(-SETTLE_DAMPING * dt))

      // Outward propagation factor: phase lag per pixel (PROPAGATION_DELAY ~60ms per stride)
      const propagationFactor = (PROPAGATION_DELAY * 2.0 * Math.PI) / stride

      // 3. Update active center index
      const activeFloat = scrollRef.current / stride
      let normalizedIndex = Math.round(activeFloat) % count
      if (normalizedIndex < 0) normalizedIndex += count
      setActiveIndex(normalizedIndex)

      // 4. Subtle center panel sweep sheen on hover (travels from -0.35 to 1.35)
      if (isHoveredRef.current) {
        sweepOpacityRef.current += (0.12 - sweepOpacityRef.current) * Math.min(1.0, dt * 6.0)
        sweepProgressRef.current += dt * 0.75
        if (sweepProgressRef.current > 1.35) {
          sweepProgressRef.current = -0.35
        }
      } else {
        sweepOpacityRef.current += (0.0 - sweepOpacityRef.current) * Math.min(1.0, dt * 8.0)
        if (sweepOpacityRef.current < 0.002) {
          sweepOpacityRef.current = 0.0
          sweepProgressRef.current = -0.35
        }
      }

      // 5. Update panel uniforms, lazy loading & opacity fade-in
      const maxAnisotropy = rendererRef.current.capabilities.getMaxAnisotropy() || 4

      // Texture fade-in with opacity only across unique project textures
      projects.forEach((_, pIdx) => {
        const status = textureStatusRef.current[pIdx]
        if (status && status.loaded && status.opacity < 1.0) {
          status.opacity = Math.min(1.0, status.opacity + dt * 4.0)
          meshesRef.current.forEach((mesh) => {
            if (mesh.userData.projectIndex === pIdx) {
              mesh.material.uniforms.uTextureLoaded.value = status.opacity
            }
          })
        }
      })

      meshesRef.current.forEach((mesh) => {
        const rawCenter = mesh.userData.meshIndex * stride
        let offset = ((rawCenter - scrollRef.current) % totalLength)
        if (offset > totalLength / 2.0) offset -= totalLength
        if (offset < -totalLength / 2.0) offset += totalLength

        const pIdx = mesh.userData.projectIndex

        // Lazy-load: if panel is within 1.8 strides of center, ensure its texture is loaded
        if (Math.abs(offset) <= stride * 1.8) {
          loadSingleTexture(pIdx, isMobile, maxAnisotropy)
        }

        mesh.material.uniforms.uScreenWidth.value = width
        mesh.material.uniforms.uPanelCenterOffset.value = offset
        mesh.material.uniforms.uWaveAmp.value = waveAmpRef.current
        mesh.material.uniforms.uWaveLength.value = waveLengthPx
        mesh.material.uniforms.uWavePhase.value = wavePhaseRef.current
        mesh.material.uniforms.uWaveSecondPhase.value = waveSecondPhaseRef.current
        mesh.material.uniforms.uWaveSecondRatio.value = WAVE_SECOND_RATIO
        mesh.material.uniforms.uWaveSecondAmp.value = WAVE_SECOND_AMP
        mesh.material.uniforms.uEnvelopeAmount.value = ENVELOPE_AMOUNT
        mesh.material.uniforms.uPanelPhaseJitter.value = PANEL_PHASE_JITTER
        mesh.material.uniforms.uStride.value = stride
        mesh.material.uniforms.uDragOriginX.value = dragOriginXRef.current
        mesh.material.uniforms.uPropagationFactor.value = propagationFactor
        mesh.material.uniforms.uBreathingFactor.value = breathingRef.current
        mesh.material.uniforms.uCenterLagX.value = centerLagRef.current
        mesh.material.uniforms.uEdgeCurlStart.value = EDGE_CURL_START
        mesh.material.uniforms.uEdgeCurlAmount.value = EDGE_CURL_AMOUNT
        mesh.material.uniforms.uMouseTilt.value.set(mouseTiltRef.current.x, mouseTiltRef.current.y)
        mesh.material.uniforms.uSweepProgress.value = sweepProgressRef.current

        const isCenter = Math.abs(offset) < stride * 0.45 ? 1.0 : 0.0
        mesh.material.uniforms.uIsCenter.value = isCenter
        mesh.material.uniforms.uSweepOpacity.value = isCenter > 0.5 ? sweepOpacityRef.current : 0.0

        // Cull panels that are completely offscreen
        mesh.visible = Math.abs(offset) < (width * 0.5 + panelWidth * 0.70)
      })

      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }

    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [isReduced, isSectionVisible, count, loadSingleTexture])

  /* ==========================================================================
     Autoplay Controller (Pauses on hover, drag, hidden)
     ========================================================================== */
  useEffect(() => {
    if (isReduced || !isSectionVisible) return

    const start = () => {
      stop()
      autoPlayTimerRef.current = setInterval(() => {
        if (!isDraggingRef.current && !isHoveredRef.current && !document.hidden) {
          const container = canvasContainerRef.current
          const width = container ? container.clientWidth : 1440
          const viewH = typeof window !== 'undefined' ? window.innerHeight : 900
          const { panelWidth, panelGap } = getPanelDimensions(width, viewH)
          const stride = panelWidth + panelGap
          targetScrollRef.current = (Math.round(targetScrollRef.current / stride) + 1) * stride
        }
      }, 5500)
    }

    const stop = () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current)
        autoPlayTimerRef.current = null
      }
    }

    start()

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isReduced, isSectionVisible])

  /* ==========================================================================
     Navigation Helpers
     ========================================================================== */
  const getStride = useCallback(() => {
    const container = canvasContainerRef.current
    const width = container ? container.clientWidth : 1440
    const viewH = typeof window !== 'undefined' ? window.innerHeight : 900
    const { panelWidth, panelGap } = getPanelDimensions(width, viewH)
    return panelWidth + panelGap
  }, [])

  const goTo = useCallback((idx) => {
    const stride = getStride()
    const curStep = Math.round(targetScrollRef.current / stride)
    let curNorm = curStep % count
    if (curNorm < 0) curNorm += count
    let diff = idx - curNorm
    if (diff > count / 2) diff -= count
    if (diff < -count / 2) diff += count
    targetScrollRef.current = (curStep + diff) * stride
  }, [count, getStride])

  const goNext = useCallback(() => {
    const stride = getStride()
    targetScrollRef.current = (Math.round(targetScrollRef.current / stride) + 1) * stride
  }, [getStride])

  const goPrev = useCallback(() => {
    const stride = getStride()
    targetScrollRef.current = (Math.round(targetScrollRef.current / stride) - 1) * stride
  }, [getStride])

  /* ==========================================================================
     Pointer Drag & Swipe Gestures
     ========================================================================== */
  const handlePointerDown = (e) => {
    if (isReduced) return
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartScrollRef.current = scrollRef.current
    dragDistanceRef.current = 0
    lastPointerXRef.current = e.clientX
    lastPointerTimeRef.current = performance.now()
    velocityRef.current = 0

    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect()
      dragOriginXRef.current = e.clientX - (rect.left + rect.width * 0.5)
    }

    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch (_) {}
    }
  }

  const handlePointerMove = (e) => {
    if (!canvasContainerRef.current) return

    const rect = canvasContainerRef.current.getBoundingClientRect()
    mouseCoordsRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseCoordsRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    mouseTiltRef.current.x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.5)
    mouseTiltRef.current.y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.5)

    if (!isDraggingRef.current) return

    const now = performance.now()
    const dx = e.clientX - dragStartXRef.current
    dragDistanceRef.current = Math.abs(dx)

    const dt = Math.max(0.001, (now - lastPointerTimeRef.current) / 1000.0)
    const stepDx = e.clientX - lastPointerXRef.current
    velocityRef.current = stepDx / dt

    lastPointerXRef.current = e.clientX
    lastPointerTimeRef.current = now

    // 1:1 direct tracking while dragging
    scrollRef.current = dragStartScrollRef.current - dx
    targetScrollRef.current = scrollRef.current
  }

  const handlePointerUp = (e) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false

    if (e.currentTarget.releasePointerCapture) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch (_) {}
    }

    const stride = getStride()

    // Click detection: if moved < 6px, treat as click
    if (dragDistanceRef.current < 6) {
      const container = canvasContainerRef.current
      if (container) {
        const width = container.clientWidth
        const viewH = typeof window !== 'undefined' ? window.innerHeight : 900
        const { panelWidth } = getPanelDimensions(width, viewH)

        // Screen X coordinate relative to center of canvas
        const screenX = mouseCoordsRef.current.x * (width / 2.0)

        if (Math.abs(screenX) < panelWidth * 0.45) {
          // Clicked center panel: open active project case study
          if (activeProject && activeProject.href) {
            navigate(activeProject.href)
          }
          return
        } else {
          // Clicked side panel: bring clicked panel smoothly to center
          const worldX = scrollRef.current + screenX
          const clickedStep = Math.round(worldX / stride)
          targetScrollRef.current = clickedStep * stride
          return
        }
      }
    }

    // Momentum glide on release
    const flick = velocityRef.current
    const momentumOffset = -Math.max(-2000, Math.min(2000, flick)) * 0.28
    const destination = scrollRef.current + momentumOffset

    // Snap to nearest panel
    targetScrollRef.current = Math.round(destination / stride) * stride
  }

  // Wheel & Trackpad scrolling
  const handleWheel = (e) => {
    if (isReduced) return
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
    if (Math.abs(delta) > 4) {
      targetScrollRef.current += delta * 1.2
      if (Math.abs(delta) > 15 && e.cancelable) {
        e.preventDefault()
      }
    }
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goPrev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goNext()
    }
  }

  const activeProject = projects[activeIndex] || projects[0]

  return (
    <section
      ref={sectionRef}
      id="work"
      className="reel-flux-section section-glow-wrap surface-dark"
      data-theme="dark"
      aria-label="Selected work portfolio carousel"
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Soft Blurred Color Glows behind carousel section */}
      <div className="section-glows" aria-hidden="true">
        <div className="section-glow section-glow-1" style={{ '--accent-glow': activeProject?.accentColor || '#0ad2a0' }} />
        <div className="section-glow section-glow-2" style={{ '--accent-glow-secondary': activeProject?.accentGlow || 'rgba(10, 210, 160, 0.28)' }} />
      </div>

      {/* Clean Eyebrow Header */}
      <div className="reel-header container">
        <p className="eyebrow">{eyebrow}</p>
      </div>

      {/* 3D WebGL Flat-with-Flare Strip Canvas */}
      {!isReduced ? (
        <div
          ref={canvasContainerRef}
          className="reel-canvas-container"
          style={{
            height: `${dimensions.canvasHeight}px`,
            marginTop: `-${dimensions.verticalBleed}px`,
            marginBottom: `-${dimensions.verticalBleed}px`
          }}
          onMouseEnter={() => { isHoveredRef.current = true }}
          onMouseLeave={() => {
            isHoveredRef.current = false
            mouseTiltRef.current = { x: 0, y: 0 }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="region"
          aria-roledescription="carousel"
          aria-label="Interactive 3D project reel"
        />
      ) : (
        /* Accessible Reduced-Motion & Non-WebGL Scroll-Snap Fallback */
        <div className="reel-reduced-fallback container" role="region" aria-label="Project posters list">
          {projects.map((p, idx) => (
            <div
              key={p.id}
              className={`reel-reduced-card ${idx === activeIndex ? 'active' : ''}`}
              style={{ aspectRatio: `${PANEL_ASPECT}` }}
              onClick={() => setActiveIndex(idx)}
            >
              <img
                src={p.media}
                alt={p.alt || p.title}
                className="reel-reduced-img"
                width={p.width || 2752}
                height={p.height || 1536}
                loading={idx < 2 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
      )}

      {/* Subtle Studio Floor Shadow */}
      <div className="reel-floor-shadow" aria-hidden="true" />

      {/* External Center-Aligned Details Box (Strictly below strip, NO overlays) */}
      <div className="reel-details-box container">
        <div key={activeIndex} className="reel-details-content">
          <div className="reel-meta-row">
            <span className="reel-counter" aria-live="polite">
              {String(activeIndex + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </span>
            <span className="reel-divider" aria-hidden="true">·</span>
            <span className="reel-category">{activeProject.category}</span>
            <span className="reel-divider" aria-hidden="true">·</span>
            <span className="reel-year">{activeProject.year}</span>
          </div>

          <h3 className="reel-title">{activeProject.title}</h3>
          <p className="reel-description">{activeProject.tagline || activeProject.description}</p>

          <div className="reel-actions">
            <Link
              to={activeProject.href}
              className="reel-view-link glass-pill focus-ring"
              aria-label={`View ${activeProject.title} case study`}
            >
              <span>View project</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Accessible Carousel Navigation Controls */}
        <div className="reel-controls-row" role="group" aria-label="Carousel navigation">
          <button
            type="button"
            onClick={goPrev}
            className="reel-ghost-btn glass-btn glass-btn-circle"
            aria-label="Previous project"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>

          <div className="reel-dashes" role="tablist" aria-label="Projects">
            {projects.map((p, idx) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={idx === activeIndex}
                aria-label={`Go to slide ${idx + 1}: ${p.title}`}
                className={`reel-dash glass-dash ${idx === activeIndex ? 'active' : ''}`}
                onClick={() => goTo(idx)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            className="reel-ghost-btn glass-btn glass-btn-circle"
            aria-label="Next project"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Visually Hidden Link List for Screen Readers, Crawlers & SEO */}
      <ul className="sr-only" aria-label="Selected work projects list">
        {projects.map((p) => (
          <li key={p.id}>
            <Link to={p.href}>
              <span>{p.title} — {p.category} ({p.year})</span>
              <p>{p.tagline || p.description}</p>
              <img src={p.media} alt={p.alt || p.title} width={p.width} height={p.height} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
