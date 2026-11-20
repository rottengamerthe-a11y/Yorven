import React, { useEffect, useRef, useState } from 'react'

/**
 * BackgroundCanvas
 * High-performance WebGL2 shader background canvas container.
 * - Handles DPR-aware canvas sizing
 * - Disables RAF when offscreen via IntersectionObserver
 * - Respects prefers-reduced-motion
 * - Provides graceful fallback if WebGL2 is unsupported
 */
export function BackgroundCanvas({
  children,
  className = '',
  style = {},
  scene,
  uniforms = {},
  speed = 1.0,
  fallback = null,
  ...props
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [hasWebGL, setHasWebGL] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Check for reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ||
        document.documentElement?.dataset?.motion === 'reduced')

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })

    if (!gl) {
      console.warn('[BackgroundCanvas] WebGL2 not supported, activating fallback.')
      setHasWebGL(false)
      return
    }

    // Vertex Shader (Full-screen quad)
    const vsSource = `#version 300 es
      in vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `

    // Default or custom fragment shader
    const fsSource = `#version 300 es
      precision highp float;
      out vec4 fragColor;

      uniform vec2 uResolution;
      uniform float uTime;
      uniform vec2 uPointer;
      ${scene ? scene.uniforms || '' : ''}

      ${scene ? scene.source : `
        void main() {
          vec2 uv = gl_FragCoord.xy / uResolution.xy;
          fragColor = vec4(uv.x * 0.1, uv.y * 0.1, 0.15, 1.0);
        }
      `}
    `

    function createShader(type, src) {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[BackgroundCanvas] Shader compile error:', gl.getShaderInfoLog(s))
        gl.deleteShader(s)
        return null
      }
      return s
    }

    const vs = createShader(gl.VERTEX_SHADER, vsSource)
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource)
    if (!vs || !fs) {
      setHasWebGL(false)
      return
    }

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[BackgroundCanvas] Program link error:', gl.getProgramInfoLog(prog))
      setHasWebGL(false)
      return
    }

    gl.useProgram(prog)

    // Setup Quad geometry
    const quadVao = gl.createVertexArray()
    gl.bindVertexArray(quadVao)

    const posBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )

    const aPos = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    // Uniform locations cache
    const uResLoc = gl.getUniformLocation(prog, 'uResolution')
    const uTimeLoc = gl.getUniformLocation(prog, 'uTime')
    const uPointerLoc = gl.getUniformLocation(prog, 'uPointer')

    const customUniformLocs = {}
    if (scene && scene.customUniformKeys) {
      for (const k of scene.customUniformKeys) {
        customUniformLocs[k] = gl.getUniformLocation(prog, k)
      }
    }

    let animId = null
    let startTime = performance.now()
    let isVisible = true
    let pointerX = 0.5
    let pointerY = 0.5

    function resize() {
      if (!container || !canvas) return
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.floor(rect.width * dpr))
      const h = Math.max(1, Math.floor(rect.height * dpr))

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    resize()
    window.addEventListener('resize', resize)

    // Pointer listener on container
    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        pointerX = (e.clientX - rect.left) / rect.width
        pointerY = 1.0 - (e.clientY - rect.top) / rect.height
      }
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    // Intersection observer to halt RAF when offscreen
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting
        if (isVisible && !prefersReducedMotion && !animId) {
          startTime = performance.now() - (lastElapsed * 1000)
          animId = requestAnimationFrame(render)
        }
      },
      { threshold: 0.05 }
    )
    observer.observe(container)

    let lastElapsed = 0

    function render(now) {
      if (!isVisible) {
        animId = null
        return
      }

      const elapsed = prefersReducedMotion ? 1.0 : ((now - startTime) * 0.001) * speed
      lastElapsed = elapsed

      gl.useProgram(prog)
      gl.bindVertexArray(quadVao)

      gl.uniform2f(uResLoc, canvas.width, canvas.height)
      gl.uniform1f(uTimeLoc, elapsed)
      gl.uniform2f(uPointerLoc, pointerX, pointerY)

      if (scene && scene.setUniforms) {
        scene.setUniforms(gl, customUniformLocs, uniforms)
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6)

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render)
      }
    }

    // Initial render frame
    render(performance.now())

    return () => {
      if (animId) cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      observer.disconnect()
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(posBuffer)
      gl.deleteVertexArray(quadVao)
    }
  }, [scene, uniforms, speed])

  return (
    <div
      ref={containerRef}
      data-slot="background-canvas"
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ isolation: 'isolate', ...style }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          display: hasWebGL ? 'block' : 'none',
          width: '100%',
          height: '100%',
        }}
      />
      {!hasWebGL && (
        <div
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 70% 30%, #315b55 0%, #082d2c 60%, #051c1a 100%)',
          }}
        />
      )}
      {children}
    </div>
  )
}
