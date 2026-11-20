import React, { useMemo } from 'react'
import { BackgroundCanvas } from './background-canvas'

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ]
}

export function Gradient({
  colors = ['#082D2C', '#315B55', '#087C48', '#D7ED83'],
  type = 'linear',
  angle = 135,
  intensity = 1.15,
  contrast = 1.1,
  detail = 0.35,
  flow = 0.45,
  softness = 0.85,
  warp = 0.8,
  scale = 1.0,
  className = '',
  children,
  ...props
}) {
  const scene = useMemo(() => {
    const rad = (angle * Math.PI) / 180

    return {
      customUniformKeys: [
        'uColor0',
        'uColor1',
        'uColor2',
        'uColor3',
        'uIntensity',
        'uContrast',
        'uDetail',
        'uFlow',
        'uSoftness',
        'uWarp',
        'uScale',
        'uAngle',
      ],
      uniforms: `
        uniform vec3 uColor0;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform float uIntensity;
        uniform float uContrast;
        uniform float uDetail;
        uniform float uFlow;
        uniform float uSoftness;
        uniform float uWarp;
        uniform float uScale;
        uniform float uAngle;
      `,
      source: `
        // 2D Simplex Noise & FBM
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m;
          m = m*m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          vec2 shift = vec2(100.0);
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for (int i = 0; i < 3; ++i) {
            v += a * snoise(p);
            p = rot * p * 2.0 + shift;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uResolution.xy;
          vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
          p *= uScale;

          // Rotation by angle
          float c = cos(uAngle);
          float s = sin(uAngle);
          mat2 rot = mat2(c, -s, s, c);
          vec2 q = rot * p;

          // Slow organic domain warping
          float t = uTime * uFlow * 0.25;
          vec2 warpOffset = vec2(
            fbm(q * (uDetail * 2.2) + vec2(t * 0.8, t * 0.4)),
            fbm(q * (uDetail * 2.2) + vec2(t * 0.5, t * 0.9) + vec2(4.3, 2.7))
          );

          vec2 warped = q + warpOffset * (uWarp * 0.65);

          // Base coordinate line across diagonal
          float gradVal = warped.x * 0.7 + warped.y * 0.3;
          float noiseVal = fbm(warped * (uDetail * 2.8) + t * 0.4);

          // Combined normalized position [0.0 .. 1.0]
          float n = clamp((gradVal + noiseVal * 0.55 + 0.5), 0.0, 1.0);

          // Restrained palette distribution:
          // Deep teal dominates (0.0 to 0.48)
          // Soft teal adds mid depth (0.35 to 0.72)
          // Forest green adds rich motion (0.60 to 0.88)
          // Lime appears strictly as a restrained highlight crest (0.86 to 1.0)
          vec3 col = uColor0;

          float blend1 = smoothstep(0.15, 0.55 * uSoftness, n);
          col = mix(col, uColor1, blend1 * 0.85);

          float blend2 = smoothstep(0.42, 0.78 * uSoftness, n);
          col = mix(col, uColor2, blend2 * 0.75);

          // Restrained lime highlight: narrow crest
          float limeCrest = smoothstep(0.82, 0.97, n);
          col = mix(col, uColor3, limeCrest * 0.32);

          // Contrast & Intensity
          col = (col - 0.5) * uContrast + 0.5;
          col *= uIntensity;

          // Subtle dithering to eliminate 8-bit banding in deep dark tones
          float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (1.0 / 255.0);
          col += dither;

          fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
      setUniforms: (gl, locs) => {
        const c0 = hexToRgb(colors[0] || '#082D2C')
        const c1 = hexToRgb(colors[1] || '#315B55')
        const c2 = hexToRgb(colors[2] || '#087C48')
        const c3 = hexToRgb(colors[3] || '#D7ED83')

        gl.uniform3f(locs.uColor0, c0[0], c0[1], c0[2])
        gl.uniform3f(locs.uColor1, c1[0], c1[1], c1[2])
        gl.uniform3f(locs.uColor2, c2[0], c2[1], c2[2])
        gl.uniform3f(locs.uColor3, c3[0], c3[1], c3[2])

        gl.uniform1f(locs.uIntensity, intensity)
        gl.uniform1f(locs.uContrast, contrast)
        gl.uniform1f(locs.uDetail, detail)
        gl.uniform1f(locs.uFlow, flow)
        gl.uniform1f(locs.uSoftness, softness)
        gl.uniform1f(locs.uWarp, warp)
        gl.uniform1f(locs.uScale, scale)
        gl.uniform1f(locs.uAngle, rad)
      },
    }
  }, [colors, angle, intensity, contrast, detail, flow, softness, warp, scale])

  return (
    <div
      data-slot="gradient"
      className={`relative w-full h-full overflow-hidden ${className}`}
      {...props}
    >
      <BackgroundCanvas
        scene={scene}
        speed={flow}
        className="w-full h-full"
      >
        {children}
      </BackgroundCanvas>
    </div>
  )
}
