/**
 * Tiny hand-rolled line chart on a <canvas>. Designed for the dashboard:
 * - one or more series (one per model)
 * - y-axis 0..100 (% remaining)
 * - x-axis = timestamps (rendered as HH:MM)
 *
 * No deps, no DOM. Just pixels. Works in any webview with a 2D context.
 */

export interface ChartSeries {
  label: string;
  values: number[];
  color: string;
}

export interface ChartOptions {
  yMin: number;
  yMax: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  gridColor?: string;
  axisColor?: string;
  backgroundColor?: string;
}

const DEFAULTS: Required<ChartOptions> = {
  yMin: 0,
  yMax: 100,
  paddingLeft: 40,
  paddingRight: 16,
  paddingTop: 16,
  paddingBottom: 24,
  gridColor: 'rgba(127,127,127,0.25)',
  axisColor: 'rgba(127,127,127,0.7)',
  backgroundColor: 'transparent',
};

export function drawLineChart(
  canvas: HTMLCanvasElement,
  timestamps: number[],
  series: ChartSeries[],
  options: ChartOptions,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const opts = { ...DEFAULTS, ...options };

  // Use device pixel ratio so the chart looks sharp on hi-dpi.
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.width;
  const cssHeight = canvas.height;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssWidth;
  const h = cssHeight;
  ctx.clearRect(0, 0, w, h);
  if (opts.backgroundColor !== 'transparent') {
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, w, h);
  }

  const plotL = opts.paddingLeft;
  const plotR = w - opts.paddingRight;
  const plotT = opts.paddingTop;
  const plotB = h - opts.paddingBottom;
  const plotW = plotR - plotL;
  const plotH = plotB - plotT;

  // Compute x scale.
  const xCount = timestamps.length;
  const xFor = (i: number): number => {
    if (xCount <= 1) return plotL;
    return plotL + (i / (xCount - 1)) * plotW;
  };
  const yFor = (v: number): number => {
    const clamped = Math.max(opts.yMin, Math.min(opts.yMax, v));
    const t = (clamped - opts.yMin) / (opts.yMax - opts.yMin);
    return plotB - t * plotH;
  };

  // Grid + Y axis labels.
  ctx.strokeStyle = opts.gridColor;
  ctx.fillStyle = opts.axisColor;
  ctx.font = '11px var(--vscode-font-family, sans-serif)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = yFor(pct);
    ctx.beginPath();
    ctx.moveTo(plotL, y);
    ctx.lineTo(plotR, y);
    ctx.stroke();
    ctx.fillText(`${pct}%`, plotL - 4, y);
  }

  // X axis labels (start, middle, end).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (xCount > 0) {
    const fmt = (t: number) => {
      const d = new Date(t);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    ctx.fillText(fmt(timestamps[0]), plotL, plotB + 4);
    if (xCount > 2) {
      ctx.fillText(fmt(timestamps[Math.floor(xCount / 2)]), (plotL + plotR) / 2, plotB + 4);
    }
    if (xCount > 1) {
      ctx.fillText(fmt(timestamps[xCount - 1]), plotR, plotB + 4);
    }
  }

  // Series.
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (!Number.isFinite(v)) continue;
      const x = xFor(i);
      const y = yFor(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  // Legend (top-right).
  if (series.length > 0) {
    ctx.font = '11px var(--vscode-font-family, sans-serif)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = plotR;
    let ly = plotT + 8;
    // Right-to-left so labels don't overflow the plot area.
    for (let i = series.length - 1; i >= 0; i--) {
      const s = series[i];
      const text = s.label;
      const textWidth = ctx.measureText(text).width;
      const blockW = textWidth + 16;
      lx -= blockW;
      if (lx < plotL) break;
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 4, 8, 8);
      ctx.fillStyle = opts.axisColor;
      ctx.fillText(text, lx + 12, ly);
    }
  }
}
