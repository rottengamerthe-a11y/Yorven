import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import * as opentypePkg from 'opentype.js'

const parseOpentype = opentypePkg.parse

/* ==========================================================================
   HEADLINE METRICS & SIZE CONFIGURATION
   ========================================================================== */
export const HEADLINE_SCALE = 1.0
export const HEADLINE_LINE_HEIGHT = 0.98 // baseline-to-baseline ratio to font em size

/* ==========================================================================
   PARTICLE SHADERS WITH GPU CURL NOISE & MOTION TRAILS
   ========================================================================== */

const particleVertexShader = `
uniform float uMorph1;          // 0.0 (Ring) -> 1.0 (Yorven)
uniform float uMorph2;          // 0.0 (Yorven) -> 1.0 (Headline)
uniform float uTime;
uniform float uPointSize;
uniform float uOpacity;
uniform float uDpr;

attribute vec3 aRing;
attribute vec3 aYorven;
attribute vec3 aHeadline;
attribute float aDelay;
attribute vec3 aSeed;
attribute vec3 aColor;
attribute float aSize;

varying vec3 vColor;
varying float vAlpha;

// Simplex 3D Curl Noise implementation for organic liquid fluid streams
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

vec3 curlNoise(vec3 p) {
  const float e = 0.04;
  float dx = snoise(p + vec3(e, 0.0, 0.0)) - snoise(p - vec3(e, 0.0, 0.0));
  float dy = snoise(p + vec3(0.0, e, 0.0)) - snoise(p - vec3(0.0, e, 0.0));
  float dz = snoise(p + vec3(0.0, 0.0, e)) - snoise(p - vec3(0.0, 0.0, e));
  return normalize(vec3(dy - dz, dz - dx, dx - dy));
}

void main() {
  vec3 pos = aRing;
  float arc = 0.0;

  // Morph 1: Ring -> YORVEN (Staggered with distance & curl noise)
  if (uMorph1 > 0.0 && uMorph2 <= 0.001) {
    float staggerWindow = 0.24;
    float startT = aDelay * staggerWindow;
    float localT = clamp((uMorph1 - startT) / (1.0 - staggerWindow), 0.0, 1.0);
    // Smooth liquid ease
    float ease1 = localT * localT * (3.0 - 2.0 * localT);

    arc = sin(ease1 * 3.14159265);
    vec3 curlDir1 = curlNoise(aRing * 0.038 + aSeed * 2.0 + uTime * 0.4);
    vec3 offset1 = curlDir1 * arc * 34.0;

    pos = mix(aRing, aYorven, ease1) + offset1;
  }
  // Morph 2: YORVEN -> Headline
  else if (uMorph2 > 0.001) {
    float staggerWindow = 0.24;
    float startT = aDelay * staggerWindow;
    float localT = clamp((uMorph2 - startT) / (1.0 - staggerWindow), 0.0, 1.0);
    float ease2 = localT * localT * (3.0 - 2.0 * localT);

    arc = sin(ease2 * 3.14159265);
    vec3 curlDir2 = curlNoise(aYorven * 0.032 + aSeed * 2.2 + uTime * 0.45);
    vec3 offset2 = curlDir2 * arc * 38.0;

    pos = mix(aYorven, aHeadline, ease2) + offset2;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Subtle velocity stretching during fast flight phases to eliminate stepping
  float stretch = 1.0 + arc * 0.35;
  float pointSize = uPointSize * aSize * uDpr * stretch * (420.0 / -mvPosition.z);
  gl_PointSize = clamp(pointSize, 3.5, 30.0);

  vColor = aColor;
  vAlpha = uOpacity;
}
`

const particleFragmentShader = `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  // Soft glowing core with bright specular center
  float core = smoothstep(0.5, 0.02, dist);
  float specular = smoothstep(0.2, 0.0, dist) * 0.85;
  vec3 col = vColor * 1.35 + vec3(specular);

  gl_FragColor = vec4(col, min(1.0, core * 1.4) * vAlpha);
}
`

/* ==========================================================================
   HIGH-CONTRAST STUDIO HORIZON ENVIRONMENT (TRUE LIQUID CHROME LOOK)
   ========================================================================== */

function createStudioHorizonEnvironment(renderer) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // Sky gradient with razor sharp dark horizon band
  const grad = ctx.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0.0, '#ffffff')     // Zenith pure white key
  grad.addColorStop(0.25, '#dbeafe')    // Ice blue sky reflection
  grad.addColorStop(0.44, '#60a5fa')    // Mid cyan sheen
  grad.addColorStop(0.48, '#1e293b')    // Pre-horizon darkening
  grad.addColorStop(0.50, '#020617')    // Sharp razor black horizon line
  grad.addColorStop(0.52, '#082d2c')    // Deep teal obsidian ground
  grad.addColorStop(0.68, '#1e1b4b')    // Rich indigo bounce
  grad.addColorStop(0.85, '#0a1210')    // Deep base
  grad.addColorStop(1.0, '#020617')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1024, 512)

  // High Key Neutral White Softbox 1 (Top Left)
  const sb1 = ctx.createRadialGradient(260, 130, 10, 260, 130, 190)
  sb1.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)')
  sb1.addColorStop(0.35, 'rgba(255, 255, 255, 0.9)')
  sb1.addColorStop(0.7, 'rgba(240, 249, 255, 0.35)')
  sb1.addColorStop(1.0, 'rgba(240, 249, 255, 0.0)')
  ctx.fillStyle = sb1
  ctx.fillRect(0, 0, 1024, 512)

  // Studio Softbox 2 (Top Right Rim - Neutral Silver Ice)
  const sb2 = ctx.createRadialGradient(780, 150, 10, 780, 150, 200)
  sb2.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)')
  sb2.addColorStop(0.4, 'rgba(224, 242, 254, 0.5)')
  sb2.addColorStop(1.0, 'rgba(224, 242, 254, 0.0)')
  ctx.fillStyle = sb2
  ctx.fillRect(0, 0, 1024, 512)

  // Ground Warm Grazing Bounce Strip (Amber Accent Edge)
  const sb3 = ctx.createLinearGradient(0, 320, 1024, 380)
  sb3.addColorStop(0.2, 'rgba(251, 191, 36, 0.0)')
  sb3.addColorStop(0.5, 'rgba(251, 146, 60, 0.30)')
  sb3.addColorStop(0.8, 'rgba(251, 191, 36, 0.0)')
  ctx.fillStyle = sb3
  ctx.fillRect(0, 280, 1024, 140)

  const texture = new THREE.CanvasTexture(canvas)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  pmremGenerator.compileEquirectangularShader()
  const envMap = pmremGenerator.fromEquirectangular(texture).texture
  texture.dispose()
  pmremGenerator.dispose()

  return envMap
}

/**
 * Creates 3D text shapes using opentype.js glyph definitions
 */
function createTextShapes(font, text, fontSize, letterSpacing = 0) {
  const shapePath = new THREE.ShapePath()
  const scale = fontSize / font.unitsPerEm
  let cursorX = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const glyph = font.charToGlyph(char)
    if (glyph) {
      const gPath = glyph.getPath(cursorX, 0, fontSize)
      for (const cmd of gPath.commands) {
        if (cmd.type === 'M') shapePath.moveTo(cmd.x, -cmd.y)
        else if (cmd.type === 'L') shapePath.lineTo(cmd.x, -cmd.y)
        else if (cmd.type === 'C') shapePath.bezierCurveTo(cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y)
        else if (cmd.type === 'Q') shapePath.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y)
        else if (cmd.type === 'Z') shapePath.closePath()
      }
      cursorX += (glyph.advanceWidth || 0) * scale + letterSpacing
    }
  }

  return { shapes: shapePath.toShapes(true), width: cursorX }
}

/* ==========================================================================
   UNIFIED HERO SCENE COMPONENT
   ========================================================================== */

export const UnifiedHeroScene = forwardRef(function UnifiedHeroScene(
  {
    initialSettled = false,
    lineHeightMultiplier = HEADLINE_LINE_HEIGHT,
    width = 1040,
    height = 290,
    onReady,
  },
  ref
) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const lastTimeRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0)
  const isVisibleRef = useRef(true)
  const introCompletedRef = useRef(initialSettled)

  // Meshes & Materials
  const ringMeshRef = useRef(null)
  const ringInnerGlowRef = useRef(null)
  const ringMatRef = useRef(null)

  const particlesMeshRef = useRef(null)
  const particleUniformsRef = useRef(null)

  const yorvenMeshRef = useRef(null)
  const yorvenMatRef = useRef(null)

  const headlineGroupRef = useRef(null)
  const chromeMatRef = useRef(null)

  // Studio Lights
  const keyLightRef = useRef(null)
  const rimLightRef = useRef(null)

  // Stored target fitted scales
  const scalesRef = useRef({ headline: 1, yorven: 1 })

  // Mouse parallax tracking with exponential smoothing
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })

  /* --------------------------------------------------------------------------
     IMPERATIVE CONTROLS DRIVEN BY MASTER GSAP TIMELINE
     -------------------------------------------------------------------------- */
  useImperativeHandle(ref, () => ({
    setIntroCompleted: (val) => {
      introCompletedRef.current = val
    },

    // Update Stage Uniforms & Continuous Opacity Sum
    updateStage: ({
      morph1 = 0,
      morph2 = 0,
      ringRotation = 0,
      ringScale = 1,
      ringOpacity = 1,
    }) => {
      // 1. Ring Updates
      if (ringMeshRef.current && ringMatRef.current) {
        ringMeshRef.current.rotation.z = ringRotation
        ringMeshRef.current.rotation.x = Math.sin(ringRotation * 0.5) * 0.15
        ringMeshRef.current.scale.set(ringScale, ringScale, ringScale)
        ringMatRef.current.opacity = Math.max(0, Math.min(1, ringOpacity))
        ringMatRef.current.transparent = ringOpacity < 0.99
        ringMeshRef.current.visible = ringOpacity > 0.001
      }
      if (ringInnerGlowRef.current) {
        ringInnerGlowRef.current.visible = ringOpacity > 0.05
        ringInnerGlowRef.current.scale.set(ringScale * 0.9, ringScale * 0.9, 1)
      }

      // 2. Uniform updates for particle shader
      if (particleUniformsRef.current) {
        particleUniformsRef.current.uMorph1.value = morph1
        particleUniformsRef.current.uMorph2.value = morph2
      }

      // 3. Continuous Coverage Opacity Calculation (meshOpacity + particleOpacity = 1.0)
      if (morph2 <= 0.001) {
        // Stage 1 -> Stage 2 (Ring -> YORVEN)
        if (morph1 <= 0.001) {
          // Pure Ring phase
          if (particleUniformsRef.current) particleUniformsRef.current.uOpacity.value = 0.0
          if (yorvenMeshRef.current) yorvenMeshRef.current.visible = false
          if (headlineGroupRef.current) headlineGroupRef.current.visible = false
        } else if (morph1 < 0.72) {
          // Particles streaming from Ring
          const pOpacity = Math.min(1, morph1 / 0.15)
          if (particleUniformsRef.current) particleUniformsRef.current.uOpacity.value = pOpacity
          if (yorvenMeshRef.current) yorvenMeshRef.current.visible = false
          if (headlineGroupRef.current) headlineGroupRef.current.visible = false
        } else {
          // Last 28% of Morph 1 & Hold on YORVEN: Particles settle, YORVEN dissolves & puffs in
          const s = Math.min(1.0, (morph1 - 0.72) / 0.28)
          const yorvenOpacity = s
          const particleOpacity = 1.0 - s

          if (particleUniformsRef.current) particleUniformsRef.current.uOpacity.value = particleOpacity

          if (yorvenMeshRef.current && yorvenMatRef.current) {
            yorvenMeshRef.current.visible = yorvenOpacity > 0.005
            const baseS = scalesRef.current.yorven
            const currentS = baseS * (0.93 + 0.07 * s)
            yorvenMeshRef.current.scale.set(currentS, currentS, baseS * (0.85 + 0.15 * s))
            yorvenMatRef.current.opacity = yorvenOpacity
            yorvenMatRef.current.transparent = yorvenOpacity < 0.99
          }
          if (headlineGroupRef.current) headlineGroupRef.current.visible = false
        }
      } else {
        // Stage 3 -> Stage 4 (YORVEN -> Headline)
        if (morph2 < 0.25) {
          // First 25% of Morph 2: YORVEN lifts into particles
          const l = morph2 / 0.25
          const yorvenOpacity = 1.0 - l
          const particleOpacity = l

          if (particleUniformsRef.current) particleUniformsRef.current.uOpacity.value = particleOpacity

          if (yorvenMeshRef.current && yorvenMatRef.current) {
            yorvenMeshRef.current.visible = yorvenOpacity > 0.005
            const baseS = scalesRef.current.yorven
            const currentS = baseS * (1.0 + 0.04 * l)
            yorvenMeshRef.current.scale.set(currentS, currentS, currentS)
            yorvenMatRef.current.opacity = yorvenOpacity
            yorvenMatRef.current.transparent = true
          }
          if (headlineGroupRef.current) headlineGroupRef.current.visible = false
        } else if (morph2 < 0.72) {
          // Particles mid-flight with curl noise
          if (particleUniformsRef.current) particleUniformsRef.current.uOpacity.value = 1.0
          if (yorvenMeshRef.current) yorvenMeshRef.current.visible = false
          if (headlineGroupRef.current) headlineGroupRef.current.visible = false
        } else {
          // Last 28% of Morph 2: Particles settle on Headline, Headline dissolves in
          const s = Math.min(1.0, (morph2 - 0.72) / 0.28)
          const headlineOpacity = s
          const particleOpacity = 1.0 - s

          if (particleUniformsRef.current) particleUniformsRef.current.uOpacity.value = particleOpacity
          if (yorvenMeshRef.current) yorvenMeshRef.current.visible = false

          if (headlineGroupRef.current && chromeMatRef.current) {
            headlineGroupRef.current.visible = headlineOpacity > 0.005
            const baseS = scalesRef.current.headline
            const currentS = baseS * (0.95 + 0.05 * s)
            headlineGroupRef.current.scale.set(currentS, currentS, baseS * (0.88 + 0.12 * s))
            chromeMatRef.current.opacity = headlineOpacity
            chromeMatRef.current.transparent = headlineOpacity < 0.99
          }
        }
      }
    },

    jumpToSettled: () => {
      introCompletedRef.current = true
      if (ringMeshRef.current) ringMeshRef.current.visible = false
      if (ringInnerGlowRef.current) ringInnerGlowRef.current.visible = false
      if (yorvenMeshRef.current) yorvenMeshRef.current.visible = false
      if (particleUniformsRef.current) particleUniformsRef.current.uOpacity.value = 0.0

      if (headlineGroupRef.current) {
        headlineGroupRef.current.visible = true
        const hlBase = scalesRef.current.headline
        headlineGroupRef.current.scale.set(hlBase, hlBase, hlBase)
        headlineGroupRef.current.position.set(0, 0, 0)
        headlineGroupRef.current.rotation.set(0, 0, 0)
      }
      if (chromeMatRef.current) {
        chromeMatRef.current.opacity = 1.0
        chromeMatRef.current.transparent = false
      }
    },

    render: (time = 0) => {
      const renderer = rendererRef.current
      const scene = sceneRef.current
      const camera = cameraRef.current
      if (!renderer || !scene || !camera || !isVisibleRef.current) return

      // Update particle shader time for fluid liquid shimmer
      if (particleUniformsRef.current) {
        particleUniformsRef.current.uTime.value = time
      }

      // Living Metallic Shimmer: Gentle light orbit
      if (keyLightRef.current) {
        keyLightRef.current.position.x = 240 + Math.sin(time * 0.6) * 45
        keyLightRef.current.position.y = 300 + Math.cos(time * 0.45) * 35
      }

      // Mouse parallax with exponential smoothing: only active after intro settles
      if (introCompletedRef.current) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const dt = Math.min((now - (lastTimeRef.current || now)) / 1000, 0.1)
        lastTimeRef.current = now
        const smoothFactor = 1 - Math.exp(-6.0 * dt)
        mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * smoothFactor
        mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * smoothFactor

        if (headlineGroupRef.current && headlineGroupRef.current.visible) {
          headlineGroupRef.current.rotation.y = mouseRef.current.x
          headlineGroupRef.current.rotation.x = mouseRef.current.y
        }
      } else {
        mouseRef.current.x = 0
        mouseRef.current.y = 0
      }

      renderer.render(scene, camera)
    },
  }))

  /* --------------------------------------------------------------------------
     THREE.JS SETUP & ASSET PIPELINE (PRE-FLIGHT GATE)
     -------------------------------------------------------------------------- */
  useEffect(() => {
    if (typeof window === 'undefined' || !canvasRef.current) return

    let isDisposed = false
    const canvas = canvasRef.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // 1. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    })
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.22
    renderer.outputColorSpace = THREE.SRGBColorSpace
    rendererRef.current = renderer

    // 2. Scene & Camera
    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(35, width / height, 1, 2000)
    camera.position.set(0, 0, 500)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 3. Studio Horizon Environment
    const envMap = createStudioHorizonEnvironment(renderer)
    scene.environment = envMap

    // 4. Studio Lighting (Polished High-Contrast Mirror Chrome Setup)
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.0)
    keyLight.position.set(240, 300, 420)
    scene.add(keyLight)
    keyLightRef.current = keyLight

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 1.4) // Crisp cool ice silver rim
    rimLight.position.set(-360, 200, -120)
    scene.add(rimLight)
    rimLightRef.current = rimLight

    const warmLight = new THREE.DirectionalLight(0xfbbf24, 0.9)
    warmLight.position.set(300, -220, 220)
    scene.add(warmLight)

    const ambLight = new THREE.AmbientLight(0xffffff, 0.45)
    scene.add(ambLight)

    // 5. Shared Inflated Chrome Material Family for Headline (Pure Mirror Chrome)
    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 1.0,
      roughness: 0.035, // High-contrast mirror reflections
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      iridescence: 0.28, // Subtle iridescent sheen only on grazing bevels
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [100, 320],
      reflectivity: 1.0,
      envMapIntensity: 2.2, // High reflectivity of studio horizon
      transparent: true,
      opacity: initialSettled ? 1.0 : 0.0,
    })
    chromeMatRef.current = chromeMat

    // 6. Ring 3D Torus Object (same chrome/iridescent material family)
    const ringMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 0.95,
      roughness: 0.04,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      iridescence: 0.65,
      iridescenceIOR: 1.4,
      iridescenceThicknessRange: [120, 420],
      envMapIntensity: 2.3,
      transparent: true,
      opacity: initialSettled ? 0.0 : 1.0,
    })
    ringMatRef.current = ringMat

    const ringGeom = new THREE.TorusGeometry(38, 5.5, 32, 100)
    const ringMesh = new THREE.Mesh(ringGeom, ringMat)
    ringMesh.visible = !initialSettled
    scene.add(ringMesh)
    ringMeshRef.current = ringMesh

    // Inner subtle glow sprite in scene
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = 128
    glowCanvas.height = 128
    const gctx = glowCanvas.getContext('2d')
    const ggrad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    ggrad.addColorStop(0, 'rgba(138, 43, 226, 0.65)')
    ggrad.addColorStop(0.4, 'rgba(255, 94, 54, 0.35)')
    ggrad.addColorStop(0.7, 'rgba(255, 165, 0, 0.15)')
    ggrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    gctx.fillStyle = ggrad
    gctx.fillRect(0, 0, 128, 128)
    const glowTex = new THREE.CanvasTexture(glowCanvas)
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    })
    const ringGlow = new THREE.Sprite(glowMat)
    ringGlow.scale.set(110, 110, 1)
    ringGlow.visible = !initialSettled
    scene.add(ringGlow)
    ringInnerGlowRef.current = ringGlow

    // 7. Groups for YORVEN and Headline
    const yorvenMeshContainer = new THREE.Group()
    yorvenMeshContainer.visible = false
    scene.add(yorvenMeshContainer)
    yorvenMeshRef.current = yorvenMeshContainer

    const headlineGroup = new THREE.Group()
    headlineGroup.visible = Boolean(initialSettled)
    scene.add(headlineGroup)
    headlineGroupRef.current = headlineGroup

    // 8. Mouse Listeners
    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      mouseRef.current.targetX = nx * 0.12
      mouseRef.current.targetY = ny * 0.09
    }
    const onMouseLeave = () => {
      mouseRef.current.targetX = 0
      mouseRef.current.targetY = 0
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    canvas.addEventListener('mouseleave', onMouseLeave)

    const onVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // 9. ASSET PRE-FLIGHT PIPELINE (TTF, Glyph Geometry, Surface Sampling, Shader Compile)
    const loadAssetsAndBuildScene = async () => {
      try {
        const res = await fetch('/fonts/titan-one.ttf')
        if (!res.ok) throw new Error('Failed to fetch /fonts/titan-one.ttf')
        const arrayBuffer = await res.arrayBuffer()
        const font = parseOpentype(arrayBuffer)

        if (isDisposed) return

        const extrudeSettings = {
          depth: 7,
          bevelEnabled: true,
          bevelThickness: 5.5,
          bevelSize: 4.2,
          bevelOffset: -0.6,
          bevelSegments: 10,
          curveSegments: 14,
        }

        const fontSize = 68

        // ==========================================
        // A. Build Headline Meshes with Metric Baseline-to-Baseline Spacing
        // ==========================================
        const l1 = createTextShapes(font, 'Launch your', fontSize, 0.6)
        const geom1 = new THREE.ExtrudeGeometry(l1.shapes, extrudeSettings)
        geom1.computeBoundingBox()
        const l1W = geom1.boundingBox.max.x - geom1.boundingBox.min.x
        // Center Line 1 horizontally around x = 0
        geom1.translate(-l1W / 2 - geom1.boundingBox.min.x, 0, 0)

        const l2 = createTextShapes(font, 'product', fontSize, 0.6)
        const geom2 = new THREE.ExtrudeGeometry(l2.shapes, extrudeSettings)
        geom2.computeBoundingBox()
        const l2W = geom2.boundingBox.max.x - geom2.boundingBox.min.x
        // Center Line 2 horizontally around x = 0
        geom2.translate(-l2W / 2 - geom2.boundingBox.min.x, 0, 0)

        // Baseline-to-baseline distance from actual font em metrics
        const baselineDistance = fontSize * lineHeightMultiplier

        // Initial vertical positioning
        const yLine1 = baselineDistance / 2
        const yLine2 = -baselineDistance / 2

        const mesh1 = new THREE.Mesh(geom1, chromeMat)
        mesh1.position.set(0, yLine1, 0)

        const mesh2 = new THREE.Mesh(geom2, chromeMat)
        mesh2.position.set(0, yLine2, 0)

        headlineGroup.add(mesh1)
        headlineGroup.add(mesh2)

        // Exact vertical centering around y = 0 from actual combined geometry bounds
        const rawBbox = new THREE.Box3().setFromObject(headlineGroup)
        const centerY = (rawBbox.max.y + rawBbox.min.y) / 2
        mesh1.position.y -= centerY
        mesh2.position.y -= centerY

        const bbox = new THREE.Box3().setFromObject(headlineGroup)

        // Frustum fitting with generous margin so letters never clip canvas bounds
        const aspect = width / height
        const targetCoverage = width < 640 ? 0.88 : width < 1024 ? 0.80 : 0.74
        const vFov = (camera.fov * Math.PI) / 180
        const visibleHeight = 2 * Math.tan(vFov / 2) * camera.position.z
        const visibleWidth = visibleHeight * aspect
        const totalW = bbox.max.x - bbox.min.x
        const totalH = bbox.max.y - bbox.min.y

        const baseScale = Math.min(
          (visibleWidth * targetCoverage) / totalW,
          (visibleHeight * 0.78) / totalH
        )
        const maxAllowedWidth = visibleWidth * (width < 640 ? 0.90 : 0.80)
        const fitScale = Math.min(baseScale * HEADLINE_SCALE, maxAllowedWidth / totalW)
        scalesRef.current.headline = fitScale

        if (initialSettled) {
          headlineGroup.scale.set(fitScale, fitScale, fitScale)
          headlineGroup.visible = true
        } else {
          headlineGroup.scale.set(0, 0, 0)
          headlineGroup.visible = false
        }

        // ==========================================
        // B. Build YORVEN Wordmark Mesh
        // ==========================================
        const ym = createTextShapes(font, 'YORVEN', fontSize * 1.08, 4)
        const geomY = new THREE.ExtrudeGeometry(ym.shapes, extrudeSettings)
        geomY.computeBoundingBox()
        const ymW = geomY.boundingBox.max.x - geomY.boundingBox.min.x
        const ymH = geomY.boundingBox.max.y - geomY.boundingBox.min.y
        geomY.translate(-ymW / 2 - geomY.boundingBox.min.x, -ymH / 2 - geomY.boundingBox.min.y, 0)

        const yorvenMat = chromeMat.clone()
        yorvenMat.opacity = 0.0
        yorvenMat.transparent = true
        yorvenMatRef.current = yorvenMat

        const meshY = new THREE.Mesh(geomY, yorvenMat)
        yorvenMeshContainer.add(meshY)

        const fitScaleY = fitScale * 1.05
        scalesRef.current.yorven = fitScaleY
        yorvenMeshContainer.scale.set(0, 0, 0)
        yorvenMeshContainer.visible = false

        // ==========================================
        // C. GPU Particle Point Sampling (18,000 Points)
        // ==========================================
        const particleCount = width < 640 ? 10000 : 18000
        const ringSampler = new MeshSurfaceSampler(ringMesh).build()
        const yorvenSampler = new MeshSurfaceSampler(meshY).build()

        const headlineSampler1 = new MeshSurfaceSampler(mesh1).build()
        const headlineSampler2 = new MeshSurfaceSampler(mesh2).build()

        const aRing = new Float32Array(particleCount * 3)
        const aYorven = new Float32Array(particleCount * 3)
        const aHeadline = new Float32Array(particleCount * 3)
        const aDelay = new Float32Array(particleCount)
        const aSeed = new Float32Array(particleCount * 3)
        const aColor = new Float32Array(particleCount * 3)
        const aSize = new Float32Array(particleCount)

        const tempV = new THREE.Vector3()

        // Saturated iridescent spectrum palette
        const ringPalette = [
          new THREE.Color('#7f93d6'), // Deep blue / iris
          new THREE.Color('#b28cff'), // Electric violet
          new THREE.Color('#ff4b36'), // Hot coral
          new THREE.Color('#ffa500'), // Amber gold
          new THREE.Color('#38d9d2'), // Radiant cyan
          new THREE.Color('#ffffff'), // Pure chrome silver
        ]

        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3

          // 1. Ring points
          ringSampler.sample(tempV)
          aRing[i3] = tempV.x
          aRing[i3 + 1] = tempV.y
          aRing[i3 + 2] = tempV.z

          // 2. YORVEN points (scaled to world target)
          yorvenSampler.sample(tempV)
          tempV.multiplyScalar(fitScaleY)
          aYorven[i3] = tempV.x
          aYorven[i3 + 1] = tempV.y
          aYorven[i3 + 2] = tempV.z

          // 3. Headline points (sampled across line 1 & line 2 matching exact positions)
          if (i % 2 === 0) {
            headlineSampler1.sample(tempV)
            tempV.y += mesh1.position.y
          } else {
            headlineSampler2.sample(tempV)
            tempV.y += mesh2.position.y
          }
          tempV.multiplyScalar(fitScale)
          aHeadline[i3] = tempV.x
          aHeadline[i3 + 1] = tempV.y
          aHeadline[i3 + 2] = tempV.z

          // 4. Staggered Attributes
          aDelay[i] = Math.random()
          aSeed[i3] = (Math.random() - 0.5) * 2.0
          aSeed[i3 + 1] = (Math.random() - 0.5) * 2.0
          aSeed[i3 + 2] = (Math.random() - 0.5) * 2.0

          // Luminous spectrum coloring
          const col = ringPalette[i % ringPalette.length]
          aColor[i3] = col.r
          aColor[i3 + 1] = col.g
          aColor[i3 + 2] = col.b

          aSize[i] = 0.9 + Math.random() * 1.5
        }

        const particleGeom = new THREE.BufferGeometry()
        particleGeom.setAttribute('position', new THREE.BufferAttribute(aRing, 3))
        particleGeom.setAttribute('aRing', new THREE.BufferAttribute(aRing, 3))
        particleGeom.setAttribute('aYorven', new THREE.BufferAttribute(aYorven, 3))
        particleGeom.setAttribute('aHeadline', new THREE.BufferAttribute(aHeadline, 3))
        particleGeom.setAttribute('aDelay', new THREE.BufferAttribute(aDelay, 1))
        particleGeom.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 3))
        particleGeom.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3))
        particleGeom.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1))

        const particleUniforms = {
          uMorph1: { value: 0.0 },
          uMorph2: { value: 0.0 },
          uTime: { value: 0.0 },
          uPointSize: { value: width < 640 ? 6.5 : 8.0 },
          uOpacity: { value: 0.0 },
          uDpr: { value: dpr },
        }
        particleUniformsRef.current = particleUniforms

        const particleMat = new THREE.ShaderMaterial({
          vertexShader: particleVertexShader,
          fragmentShader: particleFragmentShader,
          uniforms: particleUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })

        const particleMesh = new THREE.Points(particleGeom, particleMat)
        particleMesh.frustumCulled = false
        scene.add(particleMesh)
        particlesMeshRef.current = particleMesh

        // ==========================================
        // D. Warm-up & Pipeline Cache Offscreen Execution
        // ==========================================
        renderer.compile(scene, camera)
        // Render 3 warmup frames offscreen so shader compilation, GPU buffers, and pipeline states are warm
        for (let w = 0; w < 3; w++) {
          renderer.render(scene, camera)
        }

        // Notify parent that pre-flight checks are complete
        if (onReady) {
          onReady()
        }
      } catch (err) {
        console.error('Unified scene asset initialization error:', err)
        if (onReady) onReady() // Fallback gracefully
      }
    }

    loadAssetsAndBuildScene()

    return () => {
      isDisposed = true
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      renderer.dispose()
      envMap.dispose()
      chromeMat.dispose()
      ringMat.dispose()
    }
  }, [width, height, initialSettled, lineHeightMultiplier, onReady])

  return (
    <canvas
      ref={canvasRef}
      className="cinematic-unified-canvas"
      aria-hidden="true"
      style={{
        width: '100%',
        maxWidth: `${width}px`,
        height: `${height}px`,
        display: 'block',
        margin: '0 auto',
        pointerEvents: 'none',
        background: 'transparent',
      }}
    />
  )
})
