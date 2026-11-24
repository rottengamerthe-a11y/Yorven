/**
 * Liquid Glass Optics & SVG Filter Engine
 *
 * Base Architecture & Inspiration:
 * - deepika-builds/liquid-glass (MIT License) by Deepika Rao
 *   https://github.com/deepika-builds/liquid-glass
 *   Zero-dependency SVG displacement refraction using gradient-difference maps + feColorMatrix prism fringe.
 * - hyalite (VII-Cae) & Ekino / Adrien Gautier:
 *   SDF-based curvature mapping and multi-layer optical compositing with color-interpolation-filters="sRGB".
 *
 * Attribution:
 * Copyright (c) 2024 Deepika Rao (MIT License)
 * Re-engineered with React component lifecycle, shared SVG filter pool, ResizeObserver,
 * IntersectionObserver viewport culling, and tiered fallback engine.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

let defsElement = null;
const filterPool = new Map(); // key -> { id, filterEl, feImageEl, refCount }
let isChromiumBrowser = null;
let performanceDowngraded = false;

/**
 * Detects whether the current engine reliably supports SVG backdrop-filter refraction.
 * Safari parses backdrop-filter: url(#id) but renders an empty background, so Safari and
 * Firefox must strictly receive the frost fallback.
 */
export function detectGlassCapability() {
  if (typeof window === "undefined") return "frost";
  if (isChromiumBrowser !== null) {
    if (performanceDowngraded) return "frost";
    return isChromiumBrowser ? "refract" : "frost";
  }

  // Check accessibility preferences
  if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) {
    isChromiumBrowser = false;
    return "fallback";
  }

  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isChromeLike = /Chrome|Chromium|Edg/.test(ua);

  if (isSafari || isFirefox || !isChromeLike) {
    isChromiumBrowser = false;
    document.documentElement.setAttribute("data-glass", "frost");
    return "frost";
  }

  try {
    const supportsUrl = typeof CSS !== "undefined" && CSS.supports && CSS.supports("backdrop-filter", "url(#test)");
    isChromiumBrowser = supportsUrl;
  } catch (_) {
    isChromiumBrowser = false;
  }

  document.documentElement.setAttribute("data-glass", isChromiumBrowser ? "refract" : "frost");
  return isChromiumBrowser ? "refract" : "frost";
}

/**
 * Initializes the single hidden SVG <defs> container in the DOM.
 */
function ensureDefs() {
  if (defsElement && defsElement.isConnected) return defsElement;
  if (typeof document === "undefined") return null;

  let svg = document.getElementById("liquid-glass-svg-root");
  if (!svg) {
    svg = document.createElementNS(SVG_NS, "svg");
    svg.id = "liquid-glass-svg-root";
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.style.top = "-9999px";
    svg.style.left = "-9999px";
    svg.style.width = "0px";
    svg.style.height = "0px";
    svg.style.pointerEvents = "none";
    svg.style.overflow = "hidden";
    defsElement = document.createElementNS(SVG_NS, "defs");
    defsElement.id = "liquid-glass-defs";
    svg.appendChild(defsElement);
    document.body.appendChild(svg);
  } else {
    defsElement = svg.querySelector("defs");
  }
  return defsElement;
}

/**
 * Generates an optical displacement map data URI using the gradient-difference method.
 * - Red left->right ramp encodes horizontal (X) displacement.
 * - Blue top->bottom ramp encodes vertical (Y) displacement.
 * - Inset rounded rect filled with 50% gray (rgb(128,128,128)) neutralizes the interior.
 * - Blur radius sets the softness of the bevel/refraction band.
 */
export function generateDisplacementMap(w, h, radius, borderFraction = 0.08, mapBlur = 10) {
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(16, Math.round(w));
  canvas.height = Math.max(16, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Horizontal gradient ramp (Red = X displacement)
  const gx = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gx.addColorStop(0, "rgb(0, 0, 0)");
  gx.addColorStop(1, "rgb(255, 0, 0)");
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Vertical gradient ramp (Blue = Y displacement)
  const gy = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gy.addColorStop(0, "rgb(0, 0, 0)");
  gy.addColorStop(1, "rgb(0, 0, 255)");
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3. Neutralize interior (rgb(128,128,128) = 0 displacement)
  ctx.globalCompositeOperation = "source-over";
  const minDim = Math.min(canvas.width, canvas.height);
  const inset = Math.max(4, Math.round(borderFraction * minDim));
  const innerR = Math.max(2, radius - inset);

  // Soft bevel edge gradient
  ctx.filter = `blur(${mapBlur}px)`;
  ctx.fillStyle = "rgb(128, 128, 128)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2, innerR);
  } else {
    // Fallback if roundRect not natively supported
    ctx.rect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
  }
  ctx.fill();

  // Solid 100% neutral core: guaranteed zero displacement in interior (border-only refraction)
  ctx.filter = "none";
  const coreInset = inset + Math.max(2, Math.round(mapBlur * 0.75));
  const coreR = Math.max(0, innerR - Math.round(mapBlur * 0.75));
  if (canvas.width > coreInset * 2 && canvas.height > coreInset * 2) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(coreInset, coreInset, canvas.width - coreInset * 2, canvas.height - coreInset * 2, coreR);
    } else {
      ctx.rect(coreInset, coreInset, canvas.width - coreInset * 2, canvas.height - coreInset * 2);
    }
    ctx.fill();
  }

  return canvas.toDataURL();
}

/**
 * Builds or retrieves an SVG filter with chromatic aberration.
 * Elements with matching dimensions and radius share the same filter.
 */
export function acquireGlassFilter({ width, height, radius, scale = -20, chroma = 0, borderFraction = 0.08, mapBlur = 10 }) {
  const defs = ensureDefs();
  if (!defs) return null;

  const w = Math.max(16, Math.round(width));
  const h = Math.max(16, Math.round(height));
  const r = Math.max(0, Math.round(radius));
  const s = Math.round(scale);
  const key = `${w}x${h}r${r}_s${s}_c${chroma}`;

  if (filterPool.has(key)) {
    const entry = filterPool.get(key);
    entry.refCount++;
    return entry.id;
  }

  const id = `lg-filter-${Math.random().toString(36).substring(2, 9)}`;
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", "100%");
  filter.setAttribute("height", "100%");
  // Load-bearing: prevents linearRGB color shift that causes background ghosting
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const feImage = document.createElementNS(SVG_NS, "feImage");
  feImage.setAttribute("x", "0");
  feImage.setAttribute("y", "0");
  feImage.setAttribute("width", `${w}`);
  feImage.setAttribute("height", `${h}`);
  feImage.setAttribute("preserveAspectRatio", "none");
  feImage.setAttribute("result", "map");
  feImage.setAttribute("href", generateDisplacementMap(w, h, r, borderFraction, mapBlur));
  filter.appendChild(feImage);

  if (chroma === 0) {
    // Clean single-pass refraction without color fringing (for small elements, buttons, nav)
    const disp = document.createElementNS(SVG_NS, "feDisplacementMap");
    disp.setAttribute("in", "SourceGraphic");
    disp.setAttribute("in2", "map");
    disp.setAttribute("scale", `${s}`);
    disp.setAttribute("xChannelSelector", "R");
    disp.setAttribute("yChannelSelector", "B");
    filter.appendChild(disp);
  } else {
    // Multi-channel chromatic aberration for large showcase elements
    const scales = [s - chroma, s, s + chroma];
    const keepMatrices = [
      "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", // Red channel
      "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", // Green channel
      "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", // Blue channel
    ];

    const channelResults = [];
    for (let i = 0; i < 3; i++) {
      const disp = document.createElementNS(SVG_NS, "feDisplacementMap");
      disp.setAttribute("in", "SourceGraphic");
      disp.setAttribute("in2", "map");
      disp.setAttribute("scale", `${scales[i]}`);
      disp.setAttribute("xChannelSelector", "R");
      disp.setAttribute("yChannelSelector", "B");
      disp.setAttribute("result", `d${i}`);
      filter.appendChild(disp);

      const cm = document.createElementNS(SVG_NS, "feColorMatrix");
      cm.setAttribute("in", `d${i}`);
      cm.setAttribute("type", "matrix");
      cm.setAttribute("values", keepMatrices[i]);
      cm.setAttribute("result", `c${i}`);
      filter.appendChild(cm);
      channelResults.push(`c${i}`);
    }

    // Combine channels using screen blend
    const blend1 = document.createElementNS(SVG_NS, "feBlend");
    blend1.setAttribute("in", channelResults[0]);
    blend1.setAttribute("in2", channelResults[1]);
    blend1.setAttribute("mode", "screen");
    blend1.setAttribute("result", "c01");
    filter.appendChild(blend1);

    const blend2 = document.createElementNS(SVG_NS, "feBlend");
    blend2.setAttribute("in", "c01");
    blend2.setAttribute("in2", channelResults[2]);
    blend2.setAttribute("mode", "screen");
    filter.appendChild(blend2);
  }

  defs.appendChild(filter);

  const poolEntry = { id, key, filterEl: filter, feImageEl: feImage, refCount: 1 };
  filterPool.set(key, poolEntry);
  return id;
}

/**
 * Releases a shared filter from the pool.
 */
export function releaseGlassFilter(id) {
  for (const [key, entry] of filterPool.entries()) {
    if (entry.id === id) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        if (entry.filterEl && entry.filterEl.parentNode) {
          entry.filterEl.parentNode.removeChild(entry.filterEl);
        }
        filterPool.delete(key);
      }
      break;
    }
  }
}

/**
 * Frame-rate monitoring: downgrades refraction to frost if frame time exceeds 16ms consecutively.
 */
let slowFrames = 0;
let lastFrameTime = performance.now();

export function monitorFrameBudget() {
  if (typeof window === "undefined") return;
  const now = performance.now();
  const delta = now - lastFrameTime;
  lastFrameTime = now;

  if (delta > 22) {
    slowFrames++;
    if (slowFrames > 6 && !performanceDowngraded) {
      performanceDowngraded = true;
      document.documentElement.setAttribute("data-glass", "frost");
    }
  } else {
    slowFrames = Math.max(0, slowFrames - 1);
  }

  if (!performanceDowngraded) {
    requestAnimationFrame(monitorFrameBudget);
  }
}

if (typeof window !== "undefined") {
  requestAnimationFrame(monitorFrameBudget);
}
