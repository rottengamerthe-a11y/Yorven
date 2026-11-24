import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import * as opentypePkg from 'opentype.js'

const parseOpentype = opentypePkg.parse

/* ==========================================================================
   HEADLINE SIZE CONFIGURATION
   Tweak this single constant to adjust the 3D text size across all viewports.
   Affects both the headline and YORVEN wordmark proportionally.
   ========================================================================== */
export const HEADLINE_SCALE = 1.18
export const HEADLINE_LINE_HEIGHT = 0.98

/* ==========================================================================
   FONT CONFIGURATION (Locked to Titan One for production)
   ========================================================================== */
export const FONT_REGISTRY = {
  'titan-one': {
    name: 'Titan One',
    file: '/fonts/titan-one.ttf',
    label: 'Titan One (Locked)',
    fontSize: 68,
    lineGap: 16,
    bevelThickness: 5.5,
    bevelSize: 4.2,
    letterSpacing: 0.6,
  },
  'bagel-fat-one': {
    name: 'Bagel Fat One',
    file: '/fonts/bagel-fat-one.ttf',
    label: 'Bagel Fat One',
    fontSize: 66,
    lineGap: 14,
    bevelThickness: 5.0,
    bevelSize: 4.0,
    letterSpacing: 0.5,
  },
  'lilita-one': {
    name: 'Lilita One',
    file: '/fonts/lilita-one.ttf',
    label: 'Lilita One',
    fontSize: 70,
    lineGap: 18,
    bevelThickness: 5.2,
    bevelSize: 4.0,
    letterSpacing: 0.6,
  },
}

// In-memory font cache to avoid re-fetching TTFs
const fontCache = new Map()

async function loadOpentypeFont(url) {
  if (fontCache.has(url)) return fontCache.get(url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load font from ${url}`)
  const arrayBuffer = await res.arrayBuffer()
  const font = parseOpentype(arrayBuffer)
  fontCache.set(url, font)
  return font
}

/**
 * Converts text into THREE.Shape array using opentype.js glyph commands.
 * Handles glyph advance and kerning accurately without Bidi/GSUB issues.
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

/**
 * Generates an equirectangular studio + horizon reflection map
 * with sky gradient, razor-sharp dark navy horizon, softbox patches, and warm rim.
 */
function createStudioHorizonEnvironment(renderer) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  // 1. Base gradient: Soft sky to dark horizon to rich obsidian floor
  const grad = ctx.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0.0, '#ffffff')     // Zenith bright key
  grad.addColorStop(0.25, '#dbeafe')    // Ice blue sky
  grad.addColorStop(0.44, '#60a5fa')    // Mid cyan sheen
  grad.addColorStop(0.48, '#1e293b')    // Pre-horizon darkening
  grad.addColorStop(0.50, '#030812')    // Sharp razor horizon line (near-black)
  grad.addColorStop(0.52, '#082d2c')    // Deep teal studio ground
  grad.addColorStop(0.68, '#2e1065')    // Rich violet bounce
  grad.addColorStop(0.85, '#0a1210')    // Deep dark base
  grad.addColorStop(1.0, '#020617')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1024, 512)

  // 2. High Key Studio Softbox 1 (Top Left)
  const sb1 = ctx.createRadialGradient(260, 140, 10, 260, 140, 180)
  sb1.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)')
  sb1.addColorStop(0.4, 'rgba(255, 255, 255, 0.85)')
  sb1.addColorStop(0.7, 'rgba(224, 242, 254, 0.4)')
  sb1.addColorStop(1.0, 'rgba(224, 242, 254, 0.0)')
  ctx.fillStyle = sb1
  ctx.fillRect(0, 0, 1024, 512)

  // 3. Studio Softbox 2 (Top Right Rim)
  const sb2 = ctx.createRadialGradient(780, 160, 10, 780, 160, 200)
  sb2.addColorStop(0.0, 'rgba(245, 208, 254, 0.95)') // Soft lavender rim
  sb2.addColorStop(0.5, 'rgba(192, 132, 252, 0.5)')
  sb2.addColorStop(1.0, 'rgba(192, 132, 252, 0.0)')
  ctx.fillStyle = sb2
  ctx.fillRect(0, 0, 1024, 512)

  // 4. Ground Warm Reflector Strip (Amber/Gold Grazing Edge)
  const sb3 = ctx.createLinearGradient(0, 320, 1024, 380)
  sb3.addColorStop(0.2, 'rgba(251, 191, 36, 0.0)')
  sb3.addColorStop(0.5, 'rgba(251, 146, 60, 0.35)')
  sb3.addColorStop(0.8, 'rgba(251, 191, 36, 0.0)')
  ctx.fillStyle = sb3
  ctx.fillRect(0, 280, 1024, 140)

  // 5. Specular Key Spot
  ctx.beginPath()
  ctx.arc(380, 100, 45, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 1.0)'
  ctx.shadowColor = '#ffffff'
  ctx.shadowBlur = 35
  ctx.fill()
  ctx.shadowBlur = 0

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

export const LiquidChrome3DText = forwardRef(function LiquidChrome3DText(
  {
    fontId = 'titan-one',
    initialSettled = false,
    width = 1040,
    height = 290,
    className = '',
    onPrewarmed,
  },
  ref
) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const headlineGroupRef = useRef(null)
  const wordmarkGroupRef = useRef(null)
  const envMapRef = useRef(null)
  const chromeMatRef = useRef(null)
  const rafRef = useRef(0)
  const isVisibleRef = useRef(true)

  // Stored target fitted scales for wordmark and headline
  const targetScalesRef = useRef({ headline: 1, wordmark: 1 })

  // Active state to control canvas opacity and drop shadow
  const [canvasActive, setCanvasActive] = useState(initialSettled)

  // Mouse parallax tracking
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })

  // Expose timeline animation controls to CinematicHero master GSAP timeline
  useImperativeHandle(ref, () => ({
    setWordmarkProgress: (p) => {
      // p: 0 -> 1 at t=2.75s..3.6s
      if (!wordmarkGroupRef.current) return

      if (p <= 0.001) {
        wordmarkGroupRef.current.visible = false
        setCanvasActive(false)
        return
      }

      setCanvasActive(true)
      wordmarkGroupRef.current.visible = true
      if (headlineGroupRef.current) headlineGroupRef.current.visible = false

      // Inflate animation: scale grows from 0.65 to 1.0 with Z-puffing
      const baseS = targetScalesRef.current.wordmark
      const currentS = baseS * (0.65 + 0.35 * p)
      const zPuff = baseS * (0.25 + 0.75 * Math.min(1, p * 1.3))
      wordmarkGroupRef.current.scale.set(currentS, currentS, zPuff)
      wordmarkGroupRef.current.position.y = (1 - p) * -10

      // Fade in material opacity over the first 30% of the tween
      if (chromeMatRef.current) {
        chromeMatRef.current.opacity = Math.min(1, p / 0.3)
        chromeMatRef.current.transparent = p < 0.99
      }
    },

    setTransitionCrossfade: (p) => {
      // p: 0 (YORVEN 100%) -> 1 (Headline 100%) at t=4.2s..5.0s
      setCanvasActive(true)
      const wmBase = targetScalesRef.current.wordmark
      const hlBase = targetScalesRef.current.headline

      if (wordmarkGroupRef.current) {
        if (p >= 0.98) {
          wordmarkGroupRef.current.visible = false
        } else {
          wordmarkGroupRef.current.visible = true
          const wmScale = wmBase * (1 + p * 0.14)
          wordmarkGroupRef.current.scale.set(wmScale, wmScale, wmScale)
          wordmarkGroupRef.current.position.y = p * 8
        }
      }

      if (headlineGroupRef.current) {
        if (p <= 0.02) {
          headlineGroupRef.current.visible = false
        } else {
          headlineGroupRef.current.visible = true
          const hlP = (p - 0.02) / 0.98
          const hlScale = hlBase * (0.86 + 0.14 * hlP)
          headlineGroupRef.current.scale.set(hlScale, hlScale, hlScale)
          headlineGroupRef.current.position.y = (1 - hlP) * -8
        }
      }
    },

    jumpToSettled: () => {
      setCanvasActive(true)
      if (wordmarkGroupRef.current) {
        wordmarkGroupRef.current.visible = false
      }
      if (headlineGroupRef.current) {
        headlineGroupRef.current.visible = true
        const hlBase = targetScalesRef.current.headline
        headlineGroupRef.current.scale.set(hlBase, hlBase, hlBase)
        headlineGroupRef.current.position.set(0, 0, 0)
        headlineGroupRef.current.rotation.set(0, 0, 0)
      }
      if (chromeMatRef.current) {
        chromeMatRef.current.opacity = 1
        chromeMatRef.current.transparent = false
      }
    },
  }))

  /* ---------- Three.js Scene Setup & Prewarming ---------- */
  useEffect(() => {
    if (typeof window === 'undefined' || !canvasRef.current) return

    const canvas = canvasRef.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // 1. Renderer
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
    renderer.toneMappingExposure = 1.18
    renderer.outputColorSpace = THREE.SRGBColorSpace
    rendererRef.current = renderer

    // 2. Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // 3. Environment Map (Studio + Sharp Horizon)
    const envMap = createStudioHorizonEnvironment(renderer)
    scene.environment = envMap
    envMapRef.current = envMap

    // 4. Perspective Camera
    const camera = new THREE.PerspectiveCamera(35, width / height, 1, 2000)
    camera.position.set(0, 0, 500)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 5. Lights
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.7)
    keyLight.position.set(240, 300, 420)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(0xc084fc, 2.0)
    rimLight.position.set(-360, 200, -120)
    scene.add(rimLight)

    const warmLight = new THREE.DirectionalLight(0xfbbf24, 1.4)
    warmLight.position.set(300, -220, 220)
    scene.add(warmLight)

    const ambLight = new THREE.AmbientLight(0xffffff, 0.42)
    scene.add(ambLight)

    // 6. Master Inflated Liquid Chrome Material
    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 1.0,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      iridescence: 0.45,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [120, 420],
      reflectivity: 1.0,
      envMapIntensity: 1.85,
      transparent: !initialSettled,
      opacity: initialSettled ? 1 : 0,
    })
    chromeMatRef.current = chromeMat

    // 7. Groups (Hidden by default at t=0 unless initialSettled)
    const headlineGroup = new THREE.Group()
    const wordmarkGroup = new THREE.Group()
    headlineGroup.visible = Boolean(initialSettled)
    wordmarkGroup.visible = false
    scene.add(headlineGroup)
    scene.add(wordmarkGroup)
    headlineGroupRef.current = headlineGroup
    wordmarkGroupRef.current = wordmarkGroup

    // 8. Mouse parallax listener
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

    // 9. Visibility change handler (pauses render loop when tab is hidden)
    const onVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // 10. Render Loop (60 FPS, skips heavy work when hidden)
    let clock = new THREE.Clock()
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)

      if (!isVisibleRef.current) return

      // Skip rendering if neither group is visible
      const anyVisible = headlineGroup.visible || wordmarkGroup.visible
      if (!anyVisible) return

      const delta = clock.getDelta()
      const time = clock.getElapsedTime()

      // Mouse damping
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.08
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.08

      // Living Metallic Shimmer: Gentle light orbit
      keyLight.position.x = 240 + Math.sin(time * 0.7) * 45
      keyLight.position.y = 300 + Math.cos(time * 0.5) * 35

      // Parallax Tilt on active group
      if (headlineGroup.visible) {
        headlineGroup.rotation.y = mouseRef.current.x + Math.sin(time * 0.4) * 0.015
        headlineGroup.rotation.x = mouseRef.current.y + Math.cos(time * 0.35) * 0.012
      }
      if (wordmarkGroup.visible) {
        wordmarkGroup.rotation.y = mouseRef.current.x
        wordmarkGroup.rotation.x = mouseRef.current.y
      }

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      renderer.dispose()
      envMap.dispose()
      chromeMat.dispose()
    }
  }, [width, height, initialSettled])

  /* ---------- Build 3D Geometries & Prewarm Shaders ---------- */
  useEffect(() => {
    let isCancelled = false

    const fontConfig = FONT_REGISTRY[fontId] || FONT_REGISTRY['titan-one']

    loadOpentypeFont(fontConfig.file)
      .then((font) => {
        if (isCancelled || !sceneRef.current || !rendererRef.current) return

        const chromeMat = chromeMatRef.current
        const extrudeSettings = {
          depth: 7,
          bevelEnabled: true,
          bevelThickness: fontConfig.bevelThickness,
          bevelSize: fontConfig.bevelSize,
          bevelOffset: -0.6,
          bevelSegments: 10,
          curveSegments: 14,
        }

        // ==========================================
        // 1. Build Headline: "Launch your" / "product"
        // ==========================================
        const headlineGroup = headlineGroupRef.current
        if (headlineGroup) {
          while (headlineGroup.children.length > 0) {
            const child = headlineGroup.children[0]
            if (child.geometry) child.geometry.dispose()
            headlineGroup.remove(child)
          }

          // Line 1: "Launch your"
          const l1 = createTextShapes(font, 'Launch your', fontConfig.fontSize, fontConfig.letterSpacing)
          const geom1 = new THREE.ExtrudeGeometry(l1.shapes, extrudeSettings)
          geom1.computeBoundingBox()
          const l1W = geom1.boundingBox.max.x - geom1.boundingBox.min.x
          const l1H = geom1.boundingBox.max.y - geom1.boundingBox.min.y

          // Line 2: "product"
          const l2 = createTextShapes(font, 'product', fontConfig.fontSize, fontConfig.letterSpacing)
          const geom2 = new THREE.ExtrudeGeometry(l2.shapes, extrudeSettings)
          geom2.computeBoundingBox()
          const l2W = geom2.boundingBox.max.x - geom2.boundingBox.min.x
          const l2H = geom2.boundingBox.max.y - geom2.boundingBox.min.y

          const mesh1 = new THREE.Mesh(geom1, chromeMat)
          mesh1.position.x = -l1W / 2 - geom1.boundingBox.min.x
          mesh1.position.y = (l2H + fontConfig.lineGap) / 2

          const mesh2 = new THREE.Mesh(geom2, chromeMat)
          mesh2.position.x = -l2W / 2 - geom2.boundingBox.min.x
          mesh2.position.y = -(l1H + fontConfig.lineGap) / 2

          headlineGroup.add(mesh1)
          headlineGroup.add(mesh2)

          // Center the entire group at (0, 0, 0)
          const bbox = new THREE.Box3().setFromObject(headlineGroup)
          const center = new THREE.Vector3()
          bbox.getCenter(center)
          mesh1.position.y -= center.y
          mesh2.position.y -= center.y

          // Responsive camera frustum fitting with HEADLINE_SCALE
          const aspect = width / height
          const targetCoverage = width < 640 ? 0.90 : width < 1024 ? 0.82 : 0.76
          const vFov = (cameraRef.current.fov * Math.PI) / 180
          const visibleHeight = 2 * Math.tan(vFov / 2) * cameraRef.current.position.z
          const visibleWidth = visibleHeight * aspect

          const totalW = bbox.max.x - bbox.min.x
          const totalH = bbox.max.y - bbox.min.y

          const baseScale = Math.min(
            (visibleWidth * targetCoverage) / totalW,
            (visibleHeight * 0.82) / totalH
          )

          // Safe clamping so the larger text never clips across any viewport width
          const maxAllowedWidth = visibleWidth * (width < 640 ? 0.92 : 0.85)
          const fitScale = Math.min(baseScale * HEADLINE_SCALE, maxAllowedWidth / totalW)
          targetScalesRef.current.headline = fitScale

          if (initialSettled) {
            headlineGroup.scale.set(fitScale, fitScale, fitScale)
            headlineGroup.visible = true
          } else {
            headlineGroup.scale.set(0, 0, 0)
            headlineGroup.visible = false
          }
        }

        // ==========================================
        // 2. Build Wordmark: "YORVEN"
        // ==========================================
        const wordmarkGroup = wordmarkGroupRef.current
        if (wordmarkGroup) {
          while (wordmarkGroup.children.length > 0) {
            const child = wordmarkGroup.children[0]
            if (child.geometry) child.geometry.dispose()
            wordmarkGroup.remove(child)
          }

          const ym = createTextShapes(font, 'YORVEN', fontConfig.fontSize * 1.08, 4)
          const geomY = new THREE.ExtrudeGeometry(ym.shapes, extrudeSettings)
          geomY.computeBoundingBox()
          const ymW = geomY.boundingBox.max.x - geomY.boundingBox.min.x
          const ymH = geomY.boundingBox.max.y - geomY.boundingBox.min.y

          const meshY = new THREE.Mesh(geomY, chromeMat)
          meshY.position.x = -ymW / 2 - geomY.boundingBox.min.x
          meshY.position.y = -ymH / 2 - geomY.boundingBox.min.y
          wordmarkGroup.add(meshY)

          // Match wordmark scale proportionally with headline
          const fitScaleY = targetScalesRef.current.headline * 1.05
          targetScalesRef.current.wordmark = fitScaleY
          wordmarkGroup.scale.set(0, 0, 0)
          wordmarkGroup.visible = false
        }

        // ==========================================
        // 3. Prewarm Shaders & GPU Buffers (Compile Offscreen)
        // ==========================================
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.compile(sceneRef.current, cameraRef.current)
        }

        if (onPrewarmed) {
          onPrewarmed()
        }
      })
      .catch((err) => {
        console.error('Error generating 3D text geometry:', err)
      })

    return () => {
      isCancelled = true
    }
  }, [fontId, width, height, initialSettled, onPrewarmed])

  return (
    <div
      className={`liquid-chrome-3d-wrapper ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: `${width}px`,
        height: `${height}px`,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
          opacity: canvasActive ? 1 : 0,
          filter: canvasActive
            ? 'drop-shadow(0 25px 45px rgba(0, 0, 0, 0.85)) drop-shadow(0 0 40px rgba(8, 25, 24, 0.95))'
            : 'none',
          transition: 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), filter 0.45s ease',
        }}
      />
    </div>
  )
})
