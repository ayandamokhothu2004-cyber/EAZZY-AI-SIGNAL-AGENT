import React, { useRef, useEffect, useState } from 'react';
import {
  Maximize2,
  Eye,
  EyeOff,
  Layers,
  Activity,
  Crosshair,
  TrendingUp,
  Sliders,
} from 'lucide-react';
import { MarketCandle, Timeframe, Signal, InstrumentConfig } from '../types';
import { computeIndicators, analyzeMarketStructure } from '../utils/indicators';

interface TradingChartProps {
  symbol: string;
  instrument: InstrumentConfig;
  candles: MarketCandle[];
  timeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  activeSignal?: Signal | null;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  instrument,
  candles,
  timeframe,
  onSelectTimeframe,
  activeSignal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Overlay state toggles
  const [showEMAs, setShowEMAs] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showTargets, setShowTargets] = useState(true);
  const [showBOS, setShowBOS] = useState(true);

  // Crosshair state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const timeframes: Timeframe[] = ['M5', 'M15', 'H1', 'H4', 'D1'];

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;

    const width = container.clientWidth;
    const height = Math.max(380, container.clientHeight || 420);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Padding & layout dimensions
    const padTop = 30;
    const padBottom = 35;
    const padLeft = 10;
    const padRight = 65; // Price scale area

    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;

    // Determine min and max prices including active signal targets
    let minPrice = Math.min(...candles.map((c) => c.low));
    let maxPrice = Math.max(...candles.map((c) => c.high));

    if (showTargets && activeSignal && activeSignal.direction !== 'WAIT') {
      minPrice = Math.min(minPrice, activeSignal.stopLoss, activeSignal.takeProfit1);
      maxPrice = Math.max(maxPrice, activeSignal.stopLoss, activeSignal.takeProfit1);
      if (activeSignal.takeProfit2) {
        minPrice = Math.min(minPrice, activeSignal.takeProfit2);
        maxPrice = Math.max(maxPrice, activeSignal.takeProfit2);
      }
    }

    const pricePadding = (maxPrice - minPrice) * 0.08 || 0.001;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice;

    // Coordinate conversion helpers
    const getY = (price: number) => {
      return padTop + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    };

    const candleCount = candles.length;
    const candleSpacing = chartWidth / candleCount;
    const candleWidth = Math.max(2, candleSpacing * 0.7);

    const getX = (index: number) => {
      return padLeft + index * candleSpacing + candleSpacing / 2;
    };

    // Draw Grid Lines & Price Ticks
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    const numGridLines = 6;
    for (let i = 0; i <= numGridLines; i++) {
      const gridPrice = minPrice + (priceRange / numGridLines) * i;
      const y = getY(gridPrice);

      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      // Price Label
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(gridPrice.toFixed(instrument.digits), width - padRight + 6, y + 3);
    }
    ctx.setLineDash([]);

    // Compute indicators & structure
    const indicators = computeIndicators(candles);
    const structure = analyzeMarketStructure(candles);

    // 1. Draw Support / Resistance / Supply / Demand Zones
    if (showZones && structure.supportResistanceZones.length > 0) {
      for (const zone of structure.supportResistanceZones) {
        const yTop = getY(zone.topPrice);
        const yBottom = getY(zone.bottomPrice);
        const zoneH = Math.max(3, Math.abs(yBottom - yTop));

        ctx.fillStyle =
          zone.type === 'SUPPORT'
            ? 'rgba(16, 185, 129, 0.08)'
            : 'rgba(244, 63, 94, 0.08)';
        ctx.fillRect(padLeft, Math.min(yTop, yBottom), chartWidth, zoneH);

        ctx.strokeStyle =
          zone.type === 'SUPPORT'
            ? 'rgba(16, 185, 129, 0.3)'
            : 'rgba(244, 63, 94, 0.3)';
        ctx.strokeRect(padLeft, Math.min(yTop, yBottom), chartWidth, zoneH);

        ctx.fillStyle = zone.type === 'SUPPORT' ? '#34d399' : '#fb7185';
        ctx.font = '9px sans-serif';
        ctx.fillText(
          `${zone.type} (${zone.touches}x)`,
          padLeft + 8,
          Math.min(yTop, yBottom) + 10
        );
      }
    }

    // 2. Draw EMAs
    if (showEMAs) {
      const drawLine = (data: number[], color: string, widthPx = 1.5) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx;
        ctx.beginPath();
        let started = false;

        for (let i = 0; i < data.length; i++) {
          const val = data[i];
          if (!val) continue;
          const x = getX(i);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };

      drawLine(indicators.ema20, '#06b6d4', 1.5); // EMA 20 Cyan
      drawLine(indicators.ema50, '#f97316', 1.5); // EMA 50 Orange
      drawLine(indicators.ema200, '#a855f7', 1.5); // EMA 200 Purple
    }

    // 3. Draw Candlesticks
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = getX(i);
      const isBullish = c.close >= c.open;

      const yOpen = getY(c.open);
      const yClose = getY(c.close);
      const yHigh = getY(c.high);
      const yLow = getY(c.low);

      const color = isBullish ? '#10b981' : '#f43f5e';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      // Wick
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      const bodyY = Math.min(yOpen, yClose);
      const bodyH = Math.max(2, Math.abs(yClose - yOpen));
      ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyH);
    }

    // 4. Draw BOS & CHoCH Markers
    if (showBOS) {
      if (structure.lastBOS) {
        const y = getY(structure.lastBOS.price);
        ctx.strokeStyle = structure.lastBOS.type === 'BULLISH' ? '#10b981' : '#f43f5e';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padLeft + chartWidth * 0.5, y);
        ctx.lineTo(padLeft + chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = structure.lastBOS.type === 'BULLISH' ? '#34d399' : '#fb7185';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(`BOS (${structure.lastBOS.type})`, padLeft + chartWidth - 75, y - 4);
      }

      if (structure.lastCHoCH) {
        const y = getY(structure.lastCHoCH.price);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padLeft + chartWidth * 0.5, y);
        ctx.lineTo(padLeft + chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(`CHoCH (${structure.lastCHoCH.type})`, padLeft + chartWidth - 85, y - 4);
      }
    }

    // 5. Draw Active Signal Targets (Entry, Stop Loss, TP1, TP2)
    if (showTargets && activeSignal && activeSignal.direction !== 'WAIT') {
      const drawTargetLine = (
        price: number,
        color: string,
        label: string,
        dashed = false
      ) => {
        const y = getY(price);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        if (dashed) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(width - padRight, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label pill on price scale
        ctx.fillStyle = color;
        ctx.fillRect(width - padRight, y - 9, padRight - 2, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${label} ${price.toFixed(instrument.digits)}`, width - padRight + 4, y + 3);
      };

      drawTargetLine(activeSignal.suggestedEntry, '#06b6d4', 'ENTRY', true);
      drawTargetLine(activeSignal.stopLoss, '#f43f5e', 'SL');
      drawTargetLine(activeSignal.takeProfit1, '#10b981', 'TP1');
      if (activeSignal.takeProfit2) {
        drawTargetLine(activeSignal.takeProfit2, '#059669', 'TP2', true);
      }
    }

    // 6. Crosshair & Hover Tooltip
    if (mousePos && hoverIndex !== null && hoverIndex >= 0 && hoverIndex < candles.length) {
      const hCandle = candles[hoverIndex];
      const hX = getX(hoverIndex);
      const hY = mousePos.y;

      // Draw crosshair lines
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hX, padTop);
      ctx.lineTo(hX, height - padBottom);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(padLeft, hY);
      ctx.lineTo(width - padRight, hY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Timestamp at bottom
      const timeStr = new Date(hCandle.time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(hX - 30, height - padBottom + 4, 60, 18);
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(hX - 30, height - padBottom + 4, 60, 18);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, hX, height - padBottom + 16);
    }
  }, [candles, timeframe, showEMAs, showZones, showTargets, showBOS, mousePos, hoverIndex, activeSignal, instrument]);

  // Mouse move handler for interactive crosshair
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padLeft = 10;
    const padRight = 65;
    const chartWidth = rect.width - padLeft - padRight;
    const candleSpacing = chartWidth / candles.length;

    const idx = Math.floor((x - padLeft) / candleSpacing);
    if (idx >= 0 && idx < candles.length) {
      setHoverIndex(idx);
      setMousePos({ x, y });
    } else {
      setHoverIndex(null);
      setMousePos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setMousePos(null);
  };

  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : candles[candles.length - 1];

  return (
    <div ref={containerRef} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col relative shadow-sm">
      {/* Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span className="font-bold text-sm text-white uppercase">{symbol}</span>
            <span className="text-xs text-slate-300 font-mono font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {activeCandle ? activeCandle.close.toFixed(instrument.digits) : '---'}
            </span>
          </div>

          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            {timeframes.map((tf) => (
              <button
                key={tf}
                id={`tf-btn-${tf}`}
                onClick={() => onSelectTimeframe(tf)}
                className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Overlays toggle bar */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setShowEMAs(!showEMAs)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
              showEMAs
                ? 'bg-blue-600/10 text-blue-400 border-blue-500/40'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
            title="Toggle EMA 20/50/200 Stack"
          >
            <Activity className="w-3 h-3" />
            <span>EMAs</span>
          </button>

          <button
            onClick={() => setShowZones(!showZones)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
              showZones
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
            title="Toggle Support & Resistance / Supply & Demand Zones"
          >
            <Layers className="w-3 h-3" />
            <span>S/R Zones</span>
          </button>

          <button
            onClick={() => setShowBOS(!showBOS)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
              showBOS
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
            title="Toggle BOS & CHoCH Market Structure Levels"
          >
            <TrendingUp className="w-3 h-3" />
            <span>BOS/CHoCH</span>
          </button>

          <button
            onClick={() => setShowTargets(!showTargets)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
              showTargets
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/40'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
            title="Toggle Signal Entry, SL, and TP Targets"
          >
            <Crosshair className="w-3 h-3" />
            <span>Targets</span>
          </button>
        </div>
      </div>

      {/* OHLCV Stat Ribbon */}
      {activeCandle && (
        <div className="flex items-center gap-4 py-1.5 px-3 text-[11px] font-mono text-slate-400 bg-slate-950/60 rounded border border-slate-800/60">
          <span>
            O: <span className="text-slate-200 font-bold">{activeCandle.open.toFixed(instrument.digits)}</span>
          </span>
          <span>
            H: <span className="text-emerald-400 font-bold">{activeCandle.high.toFixed(instrument.digits)}</span>
          </span>
          <span>
            L: <span className="text-rose-400 font-bold">{activeCandle.low.toFixed(instrument.digits)}</span>
          </span>
          <span>
            C: <span className={`font-bold ${activeCandle.close >= activeCandle.open ? 'text-emerald-400' : 'text-rose-400'}`}>
              {activeCandle.close.toFixed(instrument.digits)}
            </span>
          </span>
          <span>
            Vol: <span className="text-slate-300">{activeCandle.volume.toLocaleString()}</span>
          </span>
          <span className="hidden sm:inline text-slate-500">
            Time: {new Date(activeCandle.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Main Canvas Chart */}
      <div className="relative w-full flex-1 min-h-[380px] mt-1 bg-slate-950 rounded-lg border border-slate-800/80 overflow-hidden flex items-center justify-center">
        {candles.length === 0 ? (
          <div className="text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200">
                DATA NOT AVAILABLE FROM CURRENT PROVIDER
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Historical candle series for {symbol} on {timeframe} is unavailable on the current Twelve Data tier or waiting for data stream.
              </p>
            </div>
          </div>
        ) : (
          <canvas
            id="trading-chart-canvas"
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="w-full h-full cursor-crosshair block"
          />
        )}
      </div>

      {/* Chart Legend */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-blue-400 inline-block"></span>
            <span>EMA 20</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block"></span>
            <span>EMA 50</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-purple-400 inline-block"></span>
            <span>EMA 200</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-500 font-mono">
          Dynamic Price Scale • Real-Time Confluence Overlay
        </div>
      </div>
    </div>
  );
};
