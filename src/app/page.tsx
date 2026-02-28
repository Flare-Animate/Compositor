"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Download, Layers, Palette, PenTool, Sparkles,
  Eye, EyeOff, RefreshCw, ZoomIn, ZoomOut, RotateCcw, MoveHorizontal,
  Droplets, Sun, Moon, Paintbrush, Eraser, Circle, Square
} from "lucide-react";
import { toast } from "sonner";

// ============== TYPES ==============
interface Settings {
  // Line weight
  lineEnable: boolean;
  lineThickness: number;
  lineVariation: number;
  lineThreshold: number;
  lineColor: string;
  lineDepthAware: boolean;
  lineRoughness: number;

  // Gradient
  gradientEnable: boolean;
  gradientStrength: number;
  gradientAngle: number;
  gradientType: "light" | "depth" | "radial";

  // Color
  colorEnable: boolean;
  saturation: number;
  contrast: number;
  brightness: number;
  vibrancy: number;

  // Grain
  grainEnable: boolean;
  grainStrength: number;

  // Blur
  blurEnable: boolean;
  bgBlurAmount: number;
  fgBlurAmount: number;
}

interface LayerData {
  outline: ImageData | null;
  colorOnly: ImageData | null;
  fullColor: ImageData | null;
  background: ImageData | null;
  width: number;
  height: number;
}

interface LayerVisibility {
  outline: { visible: boolean; opacity: number };
  color: { visible: boolean; opacity: number };
  background: { visible: boolean; opacity: number; color: string };
}

interface SelectionMask {
  data: Uint8Array; // 0 = no selection, 1-255 = selection strength
  width: number;
  height: number;
}

interface SelectionTool {
  mode: "none" | "brush" | "eraser" | "rect" | "circle";
  size: number;
  feather: number;
  targetType: "all" | "lines" | "color" | "blur";
}

const defaultSettings: Settings = {
  lineEnable: true,
  lineThickness: 2,
  lineVariation: 60,
  lineThreshold: 25,
  lineColor: "#000000",
  lineDepthAware: true,
  lineRoughness: 30,

  gradientEnable: true,
  gradientStrength: 15,
  gradientAngle: 135,
  gradientType: "light",

  colorEnable: true,
  saturation: 108,
  contrast: 108,
  brightness: 102,
  vibrancy: 112,

  grainEnable: false,
  grainStrength: 8,

  blurEnable: false,
  bgBlurAmount: 10,
  fgBlurAmount: 0,
};

const defaultLayerVisibility: LayerVisibility = {
  outline: { visible: true, opacity: 100 },
  color: { visible: true, opacity: 100 },
  background: { visible: true, opacity: 100, color: "#ffffff" },
};

// ============== HELPER FUNCTIONS ==============
const hexToRgb = (hex: string) => {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 0, g: 0, b: 0 };
};

// Simple noise function for natural variation
function noise2D(x: number, y: number, seed: number = 0): number {
  const dot = x * 12.9898 + y * 78.233 + seed;
  const sin = Math.sin(dot) * 43758.5453;
  return sin - Math.floor(sin);
}

function smoothNoise(x: number, y: number, seed: number = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const v00 = noise2D(x0, y0, seed);
  const v10 = noise2D(x0 + 1, y0, seed);
  const v01 = noise2D(x0, y0 + 1, seed);
  const v11 = noise2D(x0 + 1, y0 + 1, seed);

  const tx = fx * fx * (3 - 2 * fx);
  const ty = fy * fy * (3 - 2 * fy);

  return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
}

function fbm(x: number, y: number, octaves: number = 4, seed: number = 0): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, y * frequency, seed + i * 100);
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value;
}

// ============== PROCESSING FUNCTIONS ==============
function processImage(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  settings: Settings,
  selectionMask: SelectionMask | null,
  selectionTool: SelectionTool
): LayerData {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2];
  }

  // Full color layer with enhancements
  const fullColorData = new Uint8ClampedArray(srcData);

  // Apply color enhancement based on selection
  if (settings.colorEnable) {
    for (let i = 0; i < fullColorData.length; i += 4) {
      const pixelIdx = i / 4;
      let applyEffect = true;

      if (selectionMask && selectionTool.targetType !== "all") {
        const maskValue = selectionMask.data[pixelIdx] / 255;
        applyEffect = maskValue > 0;
      }

      if (applyEffect) {
        let r = fullColorData[i];
        let g = fullColorData[i + 1];
        let b = fullColorData[i + 2];

        const brightFactor = settings.brightness / 100;
        r *= brightFactor;
        g *= brightFactor;
        b *= brightFactor;

        const contFactor = settings.contrast / 100;
        r = ((r / 255 - 0.5) * contFactor + 0.5) * 255;
        g = ((g / 255 - 0.5) * contFactor + 0.5) * 255;
        b = ((b / 255 - 0.5) * contFactor + 0.5) * 255;

        const grayVal = 0.299 * r + 0.587 * g + 0.114 * b;
        const satFactor = settings.saturation / 100;
        r = grayVal + (r - grayVal) * satFactor;
        g = grayVal + (g - grayVal) * satFactor;
        b = grayVal + (b - grayVal) * satFactor;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const currSat = max > 0 ? (max - min) / max : 0;
        const vibFactor = 1 + ((settings.vibrancy - 100) / 100) * (1 - currSat);
        r = grayVal + (r - grayVal) * vibFactor;
        g = grayVal + (g - grayVal) * vibFactor;
        b = grayVal + (b - grayVal) * vibFactor;

        fullColorData[i] = Math.max(0, Math.min(255, Math.round(r)));
        fullColorData[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
        fullColorData[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      }
    }
  }

  // Apply gradients
  if (settings.gradientEnable && settings.gradientStrength > 0) {
    applyGradients(fullColorData, width, height, settings);
  }

  // Apply grain
  if (settings.grainEnable && settings.grainStrength > 0) {
    for (let i = 0; i < fullColorData.length; i += 4) {
      const noise = (Math.random() - 0.5) * settings.grainStrength * 2.5;
      fullColorData[i] = Math.max(0, Math.min(255, fullColorData[i] + noise));
      fullColorData[i + 1] = Math.max(0, Math.min(255, fullColorData[i + 1] + noise));
      fullColorData[i + 2] = Math.max(0, Math.min(255, fullColorData[i + 2] + noise));
    }
  }

  // Detect outlines
  const outlineData = new Uint8ClampedArray(width * height * 4);
  const edgeMask = new Uint8Array(width * height);
  
  if (settings.lineEnable) {
    createNaturalOutlines(gray, srcData, outlineData, edgeMask, width, height, settings, selectionMask, selectionTool);
  }

  // Create color-only layer
  const colorOnlyData = new Uint8ClampedArray(fullColorData);
  for (let i = 0; i < width * height; i++) {
    if (edgeMask[i] > 0) {
      const idx = i * 4;
      colorOnlyData[idx + 3] = 0;
    }
  }

  // Create background layer
  const bgData = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (edgeMask[i] === 0 && fullColorData[idx + 3] > 0) {
      bgData[idx] = fullColorData[idx];
      bgData[idx + 1] = fullColorData[idx + 1];
      bgData[idx + 2] = fullColorData[idx + 2];
      bgData[idx + 3] = 255;
    }
  }

  // Apply blur based on selection
  if (settings.blurEnable) {
    if (selectionMask && selectionTool.targetType === "blur") {
      // Apply blur only to selected areas
      const blurredData = new Uint8ClampedArray(bgData);
      applyBlur(bgData, width, height, settings.bgBlurAmount);
      
      // Blend based on selection mask
      for (let i = 0; i < width * height; i++) {
        const maskValue = selectionMask.data[i] / 255;
        if (maskValue > 0) {
          const idx = i * 4;
          for (let c = 0; c < 4; c++) {
            bgData[idx + c] = bgData[idx + c] * maskValue + blurredData[idx + c] * (1 - maskValue);
          }
        }
      }
    } else if (settings.bgBlurAmount > 0) {
      applyBlur(bgData, width, height, settings.bgBlurAmount);
    }
  }

  return {
    outline: new ImageData(outlineData, width, height),
    colorOnly: new ImageData(colorOnlyData, width, height),
    fullColor: new ImageData(fullColorData, width, height),
    background: new ImageData(bgData, width, height),
    width,
    height,
  };
}

function applyGradients(data: Uint8ClampedArray, width: number, height: number, settings: Settings) {
  const strength = settings.gradientStrength / 100;
  const angleRad = (settings.gradientAngle * Math.PI) / 180;

  const regions = new Map<string, { indices: number[], bounds: { minX: number, maxX: number, minY: number, maxY: number } }>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 128) continue;

      const qr = Math.round(data[idx] / 20) * 20;
      const qg = Math.round(data[idx + 1] / 20) * 20;
      const qb = Math.round(data[idx + 2] / 20) * 20;
      const key = `${qr},${qg},${qb}`;

      if (!regions.has(key)) {
        regions.set(key, { indices: [], bounds: { minX: width, maxX: 0, minY: height, maxY: 0 } });
      }
      const region = regions.get(key)!;
      region.indices.push(idx);
      region.bounds.minX = Math.min(region.bounds.minX, x);
      region.bounds.maxX = Math.max(region.bounds.maxX, x);
      region.bounds.minY = Math.min(region.bounds.minY, y);
      region.bounds.maxY = Math.max(region.bounds.maxY, y);
    }
  }

  regions.forEach((region) => {
    if (region.indices.length < 30) return;

    const { bounds, indices } = region;
    const regionW = Math.max(bounds.maxX - bounds.minX, 1);
    const regionH = Math.max(bounds.maxY - bounds.minY, 1);

    indices.forEach(idx => {
      const x = (idx / 4) % width;
      const y = Math.floor(idx / 4 / width);

      let factor: number;

      if (settings.gradientType === "radial") {
        const cx = bounds.minX + regionW / 2;
        const cy = bounds.minY + regionH / 2;
        const maxDist = Math.sqrt(regionW ** 2 + regionH ** 2) / 2;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        factor = 1 - (dist / maxDist) * strength * 0.4;
      } else if (settings.gradientType === "depth") {
        const depthFactor = (y - bounds.minY) / regionH;
        factor = 1 - depthFactor * strength * 0.3;
      } else {
        const nx = (x - bounds.minX) / regionW;
        const ny = (y - bounds.minY) / regionH;
        const dot = nx * Math.cos(angleRad) + ny * Math.sin(angleRad);
        factor = 1 + dot * strength * 0.3;
      }

      const shift = (factor - 1) * 45;
      data[idx] = Math.max(0, Math.min(255, data[idx] + shift));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + shift));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + shift));
    });
  });
}

function createNaturalOutlines(
  gray: Float32Array,
  srcData: Uint8ClampedArray,
  outlineData: Uint8ClampedArray,
  edgeMask: Uint8Array,
  width: number,
  height: number,
  settings: Settings,
  selectionMask: SelectionMask | null,
  selectionTool: SelectionTool
) {
  const lineColor = hexToRgb(settings.lineColor);
  const threshold = settings.lineThreshold;
  const baseThick = settings.lineThickness;
  const variation = settings.lineVariation / 100;
  const roughness = settings.lineRoughness / 100;

  const edgeMag = new Float32Array(width * height);
  const edgeAngle = new Float32Array(width * height);
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const ki = (ky + 1) * 3 + (kx + 1);
          gx += gray[idx] * sobelX[ki];
          gy += gray[idx] * sobelY[ki];
        }
      }
      const idx = y * width + x;
      edgeMag[idx] = Math.sqrt(gx * gx + gy * gy);
      edgeAngle[idx] = Math.atan2(gy, gx);
    }
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const maxDist = Math.sqrt(centerX ** 2 + centerY ** 2);
  const thicknessMap = new Float32Array(width * height);
  const seed = Math.random() * 1000;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      // Check if this pixel is in selection
      let inSelection = true;
      if (selectionMask && selectionTool.targetType === "lines") {
        inSelection = selectionMask.data[idx] > 0;
      }
      
      if (edgeMag[idx] > threshold && inSelection) {
        // Multiple noise sources for natural variation
        const strengthFactor = edgeMag[idx] / 255;
        
        // Position-based depth (foreground thicker)
        const distFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        const depthFactor = settings.lineDepthAware ? (1 - distFromCenter / maxDist) : 0.5;
        
        // Direction-based variation (lines going certain directions are thicker)
        const angleVar = Math.abs(Math.sin(edgeAngle[idx] * 2)) * 0.4;
        
        // Organic noise using fractal Brownian motion
        const organicNoise = fbm(x * 0.05, y * 0.05, 4, seed);
        const microNoise = fbm(x * 0.2, y * 0.2, 2, seed + 500);
        
        // Shape-based thickness (based on local curvature)
        const curvature = Math.abs(Math.cos(edgeAngle[idx] * 4)) * 0.3;
        
        // Combine all factors
        let thick = baseThick;
        
        // Base variation from edge strength
        thick *= (1 + strengthFactor * variation * 0.5);
        
        // Depth awareness
        if (settings.lineDepthAware) {
          thick *= (0.5 + depthFactor * 1.0);
        }
        
        // Angle/direction variation
        thick *= (1 + angleVar * variation);
        
        // Organic roughness
        thick *= (0.7 + organicNoise * 0.6 * roughness);
        
        // Micro variation for natural unevenness
        thick += (microNoise - 0.5) * roughness * 2;
        
        // Curvature-based variation
        thick *= (1 + curvature * variation * 0.5);
        
        // Add jitter for hand-drawn feel
        const jitter = (noise2D(x * 0.3, y * 0.3, seed + 200) - 0.5) * roughness * 1.5;
        thick += jitter;
        
        thick = Math.max(0.5, thick);

        thicknessMap[idx] = thick;
        edgeMask[idx] = 1;

        const pIdx = idx * 4;
        outlineData[pIdx] = lineColor.r;
        outlineData[pIdx + 1] = lineColor.g;
        outlineData[pIdx + 2] = lineColor.b;
        outlineData[pIdx + 3] = 255;
      }
    }
  }

  // Variable dilation with roughness
  const maxRadius = Math.ceil(baseThick + variation * baseThick + roughness * 2 + 1);

  for (let y = maxRadius; y < height - maxRadius; y++) {
    for (let x = maxRadius; x < width - maxRadius; x++) {
      const idx = y * width + x;
      const pIdx = idx * 4;

      if (outlineData[pIdx + 3] > 0) continue;

      // Check if in selection
      let inSelection = true;
      if (selectionMask && selectionTool.targetType === "lines") {
        inSelection = selectionMask.data[idx] > 0;
      }

      if (!inSelection) continue;

      for (let dy = -maxRadius; dy <= maxRadius; dy++) {
        for (let dx = -maxRadius; dx <= maxRadius; dx++) {
          // Add roughness to dilation shape
          const roughOffset = fbm((x + dx) * 0.1, (y + dy) * 0.1, 2, seed + 300) * roughness * 2;
          const dist = Math.sqrt(dx * dx + dy * dy) + roughOffset;
          
          const nIdx = (y + dy) * width + (x + dx);
          const nPIdx = nIdx * 4;

          if (outlineData[nPIdx + 3] > 0 && dist <= thicknessMap[nIdx]) {
            outlineData[pIdx] = outlineData[nPIdx];
            outlineData[pIdx + 1] = outlineData[nPIdx + 1];
            outlineData[pIdx + 2] = outlineData[nPIdx + 2];
            const alpha = 1 - (dist / thicknessMap[nIdx]);
            outlineData[pIdx + 3] = Math.round(255 * Math.min(1, alpha + 0.3));
            edgeMask[idx] = 1;
            break;
          }
        }
        if (outlineData[pIdx + 3] > 0) break;
      }
    }
  }
}

function applyBlur(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius < 1) return;
  
  const temp = new Uint8ClampedArray(data);
  const r = Math.ceil(radius);
  
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
        
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const idx = (y * width + nx) * 4;
          rSum += temp[idx];
          gSum += temp[idx + 1];
          bSum += temp[idx + 2];
          aSum += temp[idx + 3];
          count++;
        }
        
        const idx = (y * width + x) * 4;
        data[idx] = rSum / count;
        data[idx + 1] = gSum / count;
        data[idx + 2] = bSum / count;
        data[idx + 3] = aSum / count;
      }
    }
    
    temp.set(data);
    
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
        
        for (let dy = -r; dy <= r; dy++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const idx = (ny * width + x) * 4;
          rSum += temp[idx];
          gSum += temp[idx + 1];
          bSum += temp[idx + 2];
          aSum += temp[idx + 3];
          count++;
        }
        
        const idx = (y * width + x) * 4;
        data[idx] = rSum / count;
        data[idx + 1] = gSum / count;
        data[idx + 2] = bSum / count;
        data[idx + 3] = aSum / count;
      }
    }
    
    temp.set(data);
  }
}

// ============== EXPORT FUNCTIONS ==============
function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function exportAllLayers(layers: LayerData, layerVis: LayerVisibility) {
  const { width, height } = layers;
  
  if (layers.outline) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(layers.outline, 0, 0);
    downloadCanvas(canvas, "outline-layer.png");
  }
  
  if (layers.colorOnly) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(layers.colorOnly, 0, 0);
    downloadCanvas(canvas, "color-layer.png");
  }
  
  if (layers.background) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(layers.background, 0, 0);
    downloadCanvas(canvas, "background-layer.png");
  }
  
  toast.success("All layers exported!");
}

function exportSVG(layers: LayerData | null, layerVis: LayerVisibility) {
  if (!layers) return;
  
  const { width, height } = layers;
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `\n  <!-- Flare Compositor Export -->`;
  svg += `\n  <!-- Layer 1: Background -->`;
  
  if (layerVis.background.visible) {
    const bgColor = layerVis.background.color;
    svg += `\n  <rect width="${width}" height="${height}" fill="${bgColor}" opacity="${layerVis.background.opacity / 100}"/>`;
  }
  
  if (layerVis.color.visible && layers.colorOnly) {
    svg += `\n  <!-- Layer 2: Colors -->`;
    svg += `\n  <g opacity="${layerVis.color.opacity / 100}">`;
    
    const colorData = layers.colorOnly.data;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = (y * width + x) * 4;
        if (colorData[idx + 3] > 128) {
          const r = colorData[idx];
          const g = colorData[idx + 1];
          const b = colorData[idx + 2];
          svg += `<rect x="${x}" y="${y}" width="2" height="2" fill="rgb(${r},${g},${b})"/>`;
        }
      }
    }
    svg += `\n  </g>`;
  }
  
  if (layerVis.outline.visible && layers.outline) {
    svg += `\n  <!-- Layer 3: Outlines -->`;
    svg += `\n  <g opacity="${layerVis.outline.opacity / 100}" fill="black" stroke="none">`;
    
    const outlineData = layers.outline.data;
    for (let y = 0; y < height; y++) {
      let startX = -1;
      for (let x = 0; x <= width; x++) {
        const idx = (y * width + x) * 4;
        const isOutline = x < width && outlineData[idx + 3] > 128;
        
        if (isOutline && startX === -1) {
          startX = x;
        } else if (!isOutline && startX !== -1) {
          svg += `<rect x="${startX}" y="${y}" width="${x - startX}" height="1"/>`;
          startX = -1;
        }
      }
    }
    svg += `\n  </g>`;
  }
  
  svg += `\n</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.download = "flare-composite.svg";
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  toast.success("SVG exported with all layers!");
}

// ============== MAIN COMPONENT ==============
export default function FlareCompositor() {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [originalImageData, setOriginalImageData] = useState<Uint8ClampedArray | null>(null);
  const [imageSize, setImageSize] = useState({ width: 400, height: 300 });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [layerVis, setLayerVis] = useState<LayerVisibility>(defaultLayerVisibility);
  const [layers, setLayers] = useState<LayerData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("lines");
  const [viewMode, setViewMode] = useState<"original" | "result" | "split" | "outline" | "color" | "background" | "selection">("result");
  const [splitPos, setSplitPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [darkMode, setDarkMode] = useState(true);
  
  // Selection state
  const [selectionMask, setSelectionMask] = useState<SelectionMask | null>(null);
  const [selectionTool, setSelectionTool] = useState<SelectionTool>({
    mode: "none",
    size: 30,
    feather: 5,
    targetType: "all"
  });
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);

  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const layerCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Process image
  const process = useCallback(() => {
    if (!originalImageData || !imageSize.width || !imageSize.height) return;

    setIsProcessing(true);
    requestAnimationFrame(() => {
      const result = processImage(originalImageData, imageSize.width, imageSize.height, settings, selectionMask, selectionTool);
      setLayers(result);
      setIsProcessing(false);
    });
  }, [originalImageData, imageSize, settings, selectionMask, selectionTool]);

  // Re-process when settings change
  useEffect(() => {
    if (originalImageData) {
      const timeout = setTimeout(process, 50);
      return () => clearTimeout(timeout);
    }
  }, [originalImageData, settings, selectionMask, process]);

  // Render result canvas
  useEffect(() => {
    const canvas = resultCanvasRef.current;
    if (!canvas || !layers) return;

    const ctx = canvas.getContext("2d")!;
    canvas.width = layers.width;
    canvas.height = layers.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (layerVis.background.visible) {
      ctx.globalAlpha = layerVis.background.opacity / 100;
      ctx.fillStyle = layerVis.background.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (layerVis.color.visible && layers.colorOnly) {
      ctx.globalAlpha = layerVis.color.opacity / 100;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = layers.width;
      tempCanvas.height = layers.height;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.putImageData(layers.colorOnly, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
    }

    if (layerVis.outline.visible && layers.outline) {
      ctx.globalAlpha = layerVis.outline.opacity / 100;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = layers.width;
      tempCanvas.height = layers.height;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.putImageData(layers.outline, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
    }

    ctx.globalAlpha = 1;
  }, [layers, layerVis]);

  // Render individual layer view
  useEffect(() => {
    const canvas = layerCanvasRef.current;
    if (!canvas || !layers) return;
    
    if (viewMode !== "outline" && viewMode !== "color" && viewMode !== "background" && viewMode !== "selection") return;

    const ctx = canvas.getContext("2d")!;
    canvas.width = layers.width;
    canvas.height = layers.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (viewMode === "outline" && layers.outline) {
      ctx.putImageData(layers.outline, 0, 0);
    } else if (viewMode === "color" && layers.colorOnly) {
      ctx.putImageData(layers.colorOnly, 0, 0);
    } else if (viewMode === "background" && layers.background) {
      ctx.putImageData(layers.background, 0, 0);
    } else if (viewMode === "selection" && selectionMask) {
      // Render selection mask as overlay
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const imgData = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < selectionMask.data.length; i++) {
        const v = selectionMask.data[i];
        imgData.data[i * 4] = 100;
        imgData.data[i * 4 + 1] = 200;
        imgData.data[i * 4 + 2] = 255;
        imgData.data[i * 4 + 3] = v;
      }
      ctx.putImageData(imgData, 0, 0);
    }
  }, [layers, viewMode, selectionMask]);

  // Render selection overlay
  useEffect(() => {
    const canvas = selectionCanvasRef.current;
    if (!canvas || !imageSize.width || !imageSize.height) return;

    const ctx = canvas.getContext("2d")!;
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (selectionMask && selectionTool.mode !== "none") {
      const imgData = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < selectionMask.data.length; i++) {
        const v = selectionMask.data[i];
        if (v > 0) {
          imgData.data[i * 4] = 59;
          imgData.data[i * 4 + 1] = 130;
          imgData.data[i * 4 + 2] = 246;
          imgData.data[i * 4 + 3] = Math.min(100, v);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
  }, [selectionMask, selectionTool.mode, imageSize]);

  // File upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      setOriginalImage(img);
      setImageSize({ width: img.width, height: img.height });

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.drawImage(img, 0, 0);
      const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
      setOriginalImageData(new Uint8ClampedArray(imgData.data));

      if (originalCanvasRef.current) {
        const ctx = originalCanvasRef.current.getContext("2d")!;
        originalCanvasRef.current.width = img.width;
        originalCanvasRef.current.height = img.height;
        ctx.drawImage(img, 0, 0);
      }

      setSelectionMask(null);
      toast.success("Image loaded!");
    };
    img.src = URL.createObjectURL(file);
  };

  // Selection drawing
  const getCanvasCoords = (e: React.MouseEvent): { x: number; y: number } | null => {
    if (!containerRef.current || !imageSize.width) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);
    return { x: Math.max(0, Math.min(imageSize.width - 1, x)), y: Math.max(0, Math.min(imageSize.height - 1, y)) };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (selectionTool.mode === "none") return;
    
    const coords = getCanvasCoords(e);
    if (!coords) return;

    setIsDrawingSelection(true);
    setSelectionStart(coords);

    // Initialize selection mask if needed
    if (!selectionMask) {
      setSelectionMask({
        data: new Uint8Array(imageSize.width * imageSize.height),
        width: imageSize.width,
        height: imageSize.height
      });
    }

    if (selectionTool.mode === "brush" || selectionTool.mode === "eraser") {
      drawSelection(coords, coords);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingSelection || selectionTool.mode === "none") return;

    const coords = getCanvasCoords(e);
    if (!coords || !selectionStart) return;

    if (selectionTool.mode === "brush" || selectionTool.mode === "eraser") {
      drawSelection(selectionStart, coords);
      setSelectionStart(coords);
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!isDrawingSelection) return;

    const coords = getCanvasCoords(e);
    
    if ((selectionTool.mode === "rect" || selectionTool.mode === "circle") && selectionStart && coords && selectionMask) {
      const { x: x1, y: y1 } = selectionStart;
      const { x: x2, y: y2 } = coords;
      
      const newMask = new Uint8Array(selectionMask.data);
      
      if (selectionTool.mode === "rect") {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const idx = y * imageSize.width + x;
            newMask[idx] = 255;
          }
        }
      } else {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
          for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            if (dx * dx + dy * dy <= 1) {
              const idx = y * imageSize.width + x;
              newMask[idx] = 255;
            }
          }
        }
      }
      
      setSelectionMask(prev => prev ? { ...prev, data: newMask } : null);
    }

    setIsDrawingSelection(false);
    setSelectionStart(null);
  };

  const drawSelection = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (!selectionMask) return;

    const newMask = new Uint8Array(selectionMask.data);
    const { size, mode, feather } = selectionTool;
    
    // Bresenham line algorithm for smooth brush strokes
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const sx = from.x < to.x ? 1 : -1;
    const sy = from.y < to.y ? 1 : -1;
    let err = dx - dy;
    let x = from.x;
    let y = from.y;

    while (true) {
      // Draw brush at this point
      for (let by = -size; by <= size; by++) {
        for (let bx = -size; bx <= size; bx++) {
          const dist = Math.sqrt(bx * bx + by * by);
          if (dist <= size) {
            const px = x + bx;
            const py = y + by;
            if (px >= 0 && px < imageSize.width && py >= 0 && py < imageSize.height) {
              const idx = py * imageSize.width + px;
              const featherAmount = 1 - (dist / size) * (feather / size);
              const value = Math.round(255 * featherAmount);
              
              if (mode === "brush") {
                newMask[idx] = Math.max(newMask[idx], value);
              } else if (mode === "eraser") {
                newMask[idx] = Math.max(0, newMask[idx] - value);
              }
            }
          }
        }
      }

      if (x === to.x && y === to.y) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }

    setSelectionMask(prev => prev ? { ...prev, data: newMask } : null);
  };

  const clearSelection = () => {
    setSelectionMask(null);
  };

  const selectAll = () => {
    setSelectionMask({
      data: new Uint8Array(imageSize.width * imageSize.height).fill(255),
      width: imageSize.width,
      height: imageSize.height
    });
  };

  // Split drag
  const handleMouseDown = () => setIsDragging(true);
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setSplitPos(Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)));
  }, [isDragging]);
  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Update settings
  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateLayerVis = (layer: keyof LayerVisibility, key: string, value: boolean | number | string) => {
    setLayerVis(prev => ({
      ...prev,
      [layer]: { ...prev[layer], [key]: value }
    }));
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      darkMode 
        ? "bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white" 
        : "bg-gradient-to-br from-slate-100 via-white to-blue-100 text-slate-900"
    }`}>
      {/* Header */}
      <header className={`border-b backdrop-blur-sm sticky top-0 z-50 ${
        darkMode 
          ? "bg-slate-900/80 border-slate-700" 
          : "bg-white/80 border-slate-200"
      }`}>
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg shadow-violet-500/25">
              <img 
                src="https://avatars.githubusercontent.com/u/259040706?s=200&v=4" 
                alt="Flare Compositor" 
                className="w-8 h-8 rounded-lg"
              />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">Flare Compositor</h1>
              <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Anime Outline & Layer Processing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark/Light Mode Toggle */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDarkMode(!darkMode)}
              className={`gap-1 ${darkMode ? "text-slate-300 hover:text-white hover:bg-slate-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700">
              <Upload className="w-3 h-3 mr-1" />Upload
            </Button>
            {layers && (
              <>
                <Button size="sm" variant="secondary" onClick={() => {
                  if (resultCanvasRef.current) downloadCanvas(resultCanvasRef.current, "flare-result.png");
                }}>PNG</Button>
                <Button size="sm" variant="secondary" onClick={() => exportSVG(layers, layerVis)}>SVG</Button>
                <Button size="sm" variant="secondary" onClick={() => exportAllLayers(layers, layerVis)}>Layers</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Preview */}
        <div className="flex-1 p-3 flex flex-col min-h-0">
          {!originalImage ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <Card className={`border-dashed max-w-md ${
                darkMode ? "bg-slate-800/50 border-slate-600" : "bg-white/50 border-slate-300"
              }`}>
                <CardContent className="p-10 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-violet-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Upload an Anime Image</h3>
                  <p className={`text-sm mb-4 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    Drag and drop or click to upload
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()} className="bg-gradient-to-r from-violet-500 to-purple-600">
                    Choose File
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              {/* View controls */}
              <div className="flex items-center gap-1 mb-3 flex-wrap">
                <div className={`flex rounded-lg p-0.5 ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                  <Button size="sm" variant={viewMode === "original" ? "default" : "ghost"} onClick={() => setViewMode("original")} className="text-xs">Original</Button>
                  <Button size="sm" variant={viewMode === "result" ? "default" : "ghost"} onClick={() => setViewMode("result")} className="text-xs">Result</Button>
                  <Button size="sm" variant={viewMode === "split" ? "default" : "ghost"} onClick={() => setViewMode("split")} className="text-xs px-2"><MoveHorizontal className="w-3 h-3" /></Button>
                  <Separator orientation="vertical" className={`h-5 mx-0.5 ${darkMode ? "bg-slate-600" : "bg-slate-300"}`} />
                  <Button size="sm" variant={viewMode === "outline" ? "default" : "ghost"} onClick={() => setViewMode("outline")} className="text-xs">Lines</Button>
                  <Button size="sm" variant={viewMode === "color" ? "default" : "ghost"} onClick={() => setViewMode("color")} className="text-xs">Color</Button>
                  <Button size="sm" variant={viewMode === "background" ? "default" : "ghost"} onClick={() => setViewMode("background")} className="text-xs">BG</Button>
                  <Button size="sm" variant={viewMode === "selection" ? "default" : "ghost"} onClick={() => setViewMode("selection")} className="text-xs">Mask</Button>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}><ZoomOut className="w-3 h-3" /></Button>
                  <span className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(Math.min(3, zoom + 0.25))}><ZoomIn className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(1)}><RotateCcw className="w-3 h-3" /></Button>
                </div>
                {isProcessing && <Badge variant="secondary" className="text-xs"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />...</Badge>}
              </div>

              {/* Canvas */}
              <div 
                ref={containerRef} 
                className={`flex-1 rounded-xl overflow-auto flex items-center justify-center p-3 ${
                  darkMode 
                    ? "bg-slate-800/50 border border-slate-700" 
                    : "bg-white/50 border border-slate-200"
                }`}
                style={{ minHeight: "200px", maxHeight: "50vh" }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              >
                {viewMode === "split" ? (
                  <div className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
                    <canvas ref={resultCanvasRef} style={{ maxWidth: "none", maxHeight: "45vh" }} />
                    <div className="absolute top-0 left-0 overflow-hidden" style={{ width: `${splitPos}%`, height: "100%" }}>
                      <canvas ref={originalCanvasRef} style={{ maxWidth: "none", maxHeight: "45vh" }} />
                    </div>
                    <div className="absolute top-0 w-0.5 bg-violet-500 cursor-ew-resize" style={{ left: `${splitPos}%`, height: "100%" }} onMouseDown={handleMouseDown}>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center shadow-lg cursor-ew-resize">
                        <MoveHorizontal className="w-3 h-3 text-white" />
                      </div>
                    </div>
                    <div className="absolute top-1 left-1 bg-black/60 text-white px-2 py-0.5 rounded text-xs">Original</div>
                    <div className="absolute top-1 right-1 bg-black/60 text-white px-2 py-0.5 rounded text-xs">Result</div>
                  </div>
                ) : viewMode === "original" ? (
                  <div style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
                    <canvas ref={originalCanvasRef} style={{ maxWidth: "none", maxHeight: "45vh" }} />
                  </div>
                ) : (
                  <div className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
                    <canvas ref={resultCanvasRef} className={viewMode !== "result" ? "invisible absolute" : ""} style={{ maxWidth: "none", maxHeight: "45vh" }} />
                    <canvas ref={layerCanvasRef} className={viewMode === "result" ? "invisible absolute" : ""} style={{ maxWidth: "none", maxHeight: "45vh" }} />
                    {/* Selection overlay */}
                    <canvas 
                      ref={selectionCanvasRef} 
                      className="absolute top-0 left-0 pointer-events-none"
                      style={{ maxWidth: "none", maxHeight: "45vh" }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Settings Panel */}
        <div className={`w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex-shrink-0 overflow-auto ${
          darkMode 
            ? "bg-slate-900/80 border-slate-700" 
            : "bg-white/80 border-slate-200"
        }`}>
          <div className="p-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className={`grid grid-cols-5 w-full h-8 ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                <TabsTrigger value="lines" className="text-xs"><PenTool className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="layers" className="text-xs"><Layers className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="gradient" className="text-xs"><Palette className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="color" className="text-xs"><Sparkles className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="select" className="text-xs"><Paintbrush className="w-3 h-3" /></TabsTrigger>
              </TabsList>

              {/* Lines Tab */}
              <TabsContent value="lines" className="space-y-3 mt-3">
                <Card className={darkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Enable Outlines</Label>
                      <Switch checked={settings.lineEnable} onCheckedChange={v => updateSetting("lineEnable", v)} />
                    </div>
                    <Separator className={darkMode ? "bg-slate-600" : "bg-slate-300"} />
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1"><Label>Thickness</Label><span>{settings.lineThickness}px</span></div>
                        <Slider value={[settings.lineThickness]} onValueChange={v => updateSetting("lineThickness", v[0])} min={1} max={10} />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><Label>Variation</Label><span>{settings.lineVariation}%</span></div>
                        <Slider value={[settings.lineVariation]} onValueChange={v => updateSetting("lineVariation", v[0])} min={0} max={100} />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><Label>Roughness</Label><span>{settings.lineRoughness}%</span></div>
                        <Slider value={[settings.lineRoughness]} onValueChange={v => updateSetting("lineRoughness", v[0])} min={0} max={100} />
                        <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Natural unevenness</p>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><Label>Threshold</Label><span>{settings.lineThreshold}</span></div>
                        <Slider value={[settings.lineThreshold]} onValueChange={v => updateSetting("lineThreshold", v[0])} min={5} max={80} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs font-medium">Depth Aware</Label>
                          <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>FG thicker, BG thinner</p>
                        </div>
                        <Switch checked={settings.lineDepthAware} onCheckedChange={v => updateSetting("lineDepthAware", v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Line Color</Label>
                        <input type="color" value={settings.lineColor} onChange={e => updateSetting("lineColor", e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Layers Tab */}
              <TabsContent value="layers" className="space-y-3 mt-3">
                <Card className={darkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}>
                  <CardContent className="p-3 space-y-2">
                    <div className={`text-xs font-medium mb-2 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Layer Control</div>
                    
                    {/* Background */}
                    <div className={`p-2 rounded-lg ${darkMode ? "bg-slate-700/50" : "bg-slate-100"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => updateLayerVis("background", "visible", !layerVis.background.visible)}>
                            {layerVis.background.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                          <span className="text-xs font-medium">Background</span>
                        </div>
                        <input type="color" value={layerVis.background.color} onChange={e => updateLayerVis("background", "color", e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0" />
                      </div>
                      <Slider value={[layerVis.background.opacity]} onValueChange={v => updateLayerVis("background", "opacity", v[0])} max={100} />
                      <div className={`text-xs text-right ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{layerVis.background.opacity}%</div>
                    </div>

                    {/* Color */}
                    <div className={`p-2 rounded-lg ${darkMode ? "bg-slate-700/50" : "bg-slate-100"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => updateLayerVis("color", "visible", !layerVis.color.visible)}>
                            {layerVis.color.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                          <span className="text-xs font-medium">Colors</span>
                        </div>
                      </div>
                      <Slider value={[layerVis.color.opacity]} onValueChange={v => updateLayerVis("color", "opacity", v[0])} max={100} />
                      <div className={`text-xs text-right ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{layerVis.color.opacity}%</div>
                    </div>

                    {/* Outlines */}
                    <div className={`p-2 rounded-lg ${darkMode ? "bg-slate-700/50" : "bg-slate-100"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => updateLayerVis("outline", "visible", !layerVis.outline.visible)}>
                            {layerVis.outline.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                          <span className="text-xs font-medium">Outlines</span>
                        </div>
                      </div>
                      <Slider value={[layerVis.outline.opacity]} onValueChange={v => updateLayerVis("outline", "opacity", v[0])} max={100} />
                      <div className={`text-xs text-right ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{layerVis.outline.opacity}%</div>
                    </div>

                    {/* Blur */}
                    <Separator className={darkMode ? "bg-slate-600" : "bg-slate-300"} />
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Blur Effect</Label>
                      <Switch checked={settings.blurEnable} onCheckedChange={v => updateSetting("blurEnable", v)} />
                    </div>
                    {settings.blurEnable && (
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1"><Label>Background Blur</Label><span>{settings.bgBlurAmount}px</span></div>
                          <Slider value={[settings.bgBlurAmount]} onValueChange={v => updateSetting("bgBlurAmount", v[0])} min={0} max={30} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Gradient Tab */}
              <TabsContent value="gradient" className="space-y-3 mt-3">
                <Card className={darkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Gradients</Label>
                      <Switch checked={settings.gradientEnable} onCheckedChange={v => updateSetting("gradientEnable", v)} />
                    </div>
                    <Separator className={darkMode ? "bg-slate-600" : "bg-slate-300"} />
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Type</Label>
                        <div className="flex gap-1 mt-1">
                          {(["light", "depth", "radial"] as const).map(t => (
                            <Button key={t} size="sm" variant={settings.gradientType === t ? "default" : "outline"} onClick={() => updateSetting("gradientType", t)} className="flex-1 text-xs">{t}</Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><Label>Strength</Label><span>{settings.gradientStrength}%</span></div>
                        <Slider value={[settings.gradientStrength]} onValueChange={v => updateSetting("gradientStrength", v[0])} min={0} max={50} />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1"><Label>Angle</Label><span>{settings.gradientAngle}°</span></div>
                        <Slider value={[settings.gradientAngle]} onValueChange={v => updateSetting("gradientAngle", v[0])} min={0} max={360} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={darkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Grain</Label>
                      <Switch checked={settings.grainEnable} onCheckedChange={v => updateSetting("grainEnable", v)} />
                    </div>
                    {settings.grainEnable && (
                      <div>
                        <div className="flex justify-between text-xs mb-1"><Label>Strength</Label><span>{settings.grainStrength}</span></div>
                        <Slider value={[settings.grainStrength]} onValueChange={v => updateSetting("grainStrength", v[0])} min={1} max={20} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Color Tab */}
              <TabsContent value="color" className="space-y-3 mt-3">
                <Card className={darkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Color Enhancement</Label>
                      <Switch checked={settings.colorEnable} onCheckedChange={v => updateSetting("colorEnable", v)} />
                    </div>
                    <Separator className={darkMode ? "bg-slate-600" : "bg-slate-300"} />
                    <div className="space-y-3">
                      {[
                        { label: "Saturation", key: "saturation" as const, min: 80, max: 130 },
                        { label: "Contrast", key: "contrast" as const, min: 80, max: 130 },
                        { label: "Brightness", key: "brightness" as const, min: 80, max: 120 },
                        { label: "Vibrancy", key: "vibrancy" as const, min: 80, max: 130 },
                      ].map(s => (
                        <div key={s.key}>
                          <div className="flex justify-between text-xs mb-1"><Label>{s.label}</Label><span>{settings[s.key]}%</span></div>
                          <Slider value={[settings[s.key]]} onValueChange={v => updateSetting(s.key, v[0])} min={s.min} max={s.max} />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Selection Tab */}
              <TabsContent value="select" className="space-y-3 mt-3">
                <Card className={darkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}>
                  <CardContent className="p-3 space-y-3">
                    <div className={`text-xs font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Selection Tools</div>
                    <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                      Select areas to customize effects
                    </p>
                    
                    {/* Tool Selection */}
                    <div className="grid grid-cols-4 gap-1">
                      <Button 
                        size="sm" 
                        variant={selectionTool.mode === "none" ? "default" : "outline"} 
                        onClick={() => setSelectionTool(prev => ({ ...prev, mode: "none" }))}
                        className="text-xs"
                      >
                        Off
                      </Button>
                      <Button 
                        size="sm" 
                        variant={selectionTool.mode === "brush" ? "default" : "outline"} 
                        onClick={() => setSelectionTool(prev => ({ ...prev, mode: "brush" }))}
                        className="text-xs"
                      >
                        <Paintbrush className="w-3 h-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant={selectionTool.mode === "eraser" ? "default" : "outline"} 
                        onClick={() => setSelectionTool(prev => ({ ...prev, mode: "eraser" }))}
                        className="text-xs"
                      >
                        <Eraser className="w-3 h-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant={selectionTool.mode === "rect" ? "default" : "outline"} 
                        onClick={() => setSelectionTool(prev => ({ ...prev, mode: "rect" }))}
                        className="text-xs"
                      >
                        <Square className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    {/* Target */}
                    <div>
                      <Label className="text-xs">Apply Selection To</Label>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        {(["all", "lines", "color", "blur"] as const).map(t => (
                          <Button 
                            key={t} 
                            size="sm" 
                            variant={selectionTool.targetType === t ? "default" : "outline"} 
                            onClick={() => setSelectionTool(prev => ({ ...prev, targetType: t }))}
                            className="text-xs capitalize"
                          >
                            {t}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {selectionTool.mode !== "none" && (
                      <>
                        <div>
                          <div className="flex justify-between text-xs mb-1"><Label>Brush Size</Label><span>{selectionTool.size}</span></div>
                          <Slider value={[selectionTool.size]} onValueChange={v => setSelectionTool(prev => ({ ...prev, size: v[0] }))} min={5} max={100} />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1"><Label>Feather</Label><span>{selectionTool.feather}</span></div>
                          <Slider value={[selectionTool.feather]} onValueChange={v => setSelectionTool(prev => ({ ...prev, feather: v[0] }))} min={0} max={50} />
                        </div>
                      </>
                    )}

                    <Separator className={darkMode ? "bg-slate-600" : "bg-slate-300"} />
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={selectAll} className="flex-1 text-xs">Select All</Button>
                      <Button size="sm" variant="outline" onClick={clearSelection} className="flex-1 text-xs">Clear</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className={`py-2 px-4 text-center text-xs border-t ${
        darkMode 
          ? "bg-slate-900/50 border-slate-700 text-slate-400" 
          : "bg-white/50 border-slate-200 text-slate-500"
      }`}>
        Flare Compositor • Part of the Flare Project
      </footer>
    </div>
  );
}
