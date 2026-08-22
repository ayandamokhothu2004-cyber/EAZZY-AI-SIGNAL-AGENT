import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  Activity,
  Layers,
  Crosshair,
  TrendingUp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Radio,
  Clock,
  Sparkles,
} from 'lucide-react';
import { MarketCandle, Timeframe, Signal, InstrumentConfig } from '../types';
import { computeIndicators, analyzeMarketStructure } from '../utils/indicators';
import { getCandleCountdown } from '../utils/candleLifecycle';

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
  // DOM References
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const crosshairCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---------------------------------------------------------
  // A. CHART OVERLAY TOGGLES
  // ---------------------------------------------------------
  const [showEMAs, setShowEMAs] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showTargets, setShowTargets] = useState(true);
  const [showBOS, setShowBOS] = useState(true);

  // ---------------------------------------------------------
  // B. VIEWPORT STATE (Source of Truth for Zoom & Pan)
  // ---------------------------------------------------------
  const [visibleCandleCount, setVisibleCandleCount] = useState<number>(60);
  const [viewportOffset, setViewportOffset] = useState<number>(0); // 0 = pinned to right edge
  const [isLiveFollowing, setIsLiveFollowing] = useState<boolean>(true);

  // Viewport Refs for synchronous access during event handling (avoids stale closures)
  const visibleCandleCountRef = useRef(visibleCandleCount);
  visibleCandleCountRef.current = visibleCandleCount;

  const viewportOffsetRef = useRef(viewportOffset);
  viewportOffsetRef.current = viewportOffset;

  const isLiveFollowingRef = useRef(isLiveFollowing);
  isLiveFollowingRef.current = isLiveFollowing;

  // ---------------------------------------------------------
  // C. FULLSCREEN STATE
  // ---------------------------------------------------------
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // ---------------------------------------------------------
  // D. CROSSHAIR & HOVER STATE (Isolated from Viewport)
  // ---------------------------------------------------------
  const [hoveredCandle, setHoveredCandle] = useState<MarketCandle | null>(null);
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);

  // ---------------------------------------------------------
  // E. DRAG & PAN STATE
  // ---------------------------------------------------------
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);

  // ---------------------------------------------------------
  // F. CANVAS DIMENSIONS (Tracked via ResizeObserver)
  // ---------------------------------------------------------
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 420,
  });

  // ---------------------------------------------------------
  // G. REAL-TIME CANDLE COUNTDOWN (1-second tick)
  // ---------------------------------------------------------
  const [countdownStr, setCountdownStr] = useState<string>('--:--');

  const timeframes: Timeframe[] = ['M5', 'M15', 'H1', 'H4', 'D1'];

  // =========================================================
  // 1. Live Countdown Timer (1000ms independent interval)
  // =========================================================
  useEffect(() => {
    const updateCountdown = () => {
      const latestCandle = candles.length > 0 ? candles[candles.length - 1] : undefined;
      const cd = getCandleCountdown(timeframe, latestCandle ? latestCandle.time : undefined, Date.now());
      setCountdownStr(cd.formatted);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [timeframe, candles]);

  // =========================================================
  // 2. Fullscreen Synchronization & Browser Fullscreen API
  // =========================================================
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNativeFs = !!document.fullscreenElement;
      setIsFullscreen(isNativeFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    if (!isFullscreen) {
      // Enter fullscreen: Try native Browser Fullscreen API first
      try {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen();
        } else {
          // Fallback if browser fullscreen is blocked or not available
          setIsFullscreen(true);
        }
      } catch (err) {
        // Fallback to CSS fullscreen overlay
        setIsFullscreen(true);
      }
    } else {
      // Exit fullscreen
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      } catch (err) {
        // Continue
      }
      setIsFullscreen(false);
    }
  };

  // =========================================================
  // 3. ResizeObserver: Update canvas dimensions without altering zoom
  // =========================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0) {
          // In fullscreen mode, use container height or viewport height
          const chartH = isFullscreen ? Math.max(480, height - 120) : Math.max(380, height - 100);
          setDimensions({
            width: Math.floor(width),
            height: Math.floor(chartH),
          });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isFullscreen]);

  // =========================================================
  // 4. Symbol or Timeframe Switch: Reset Viewport Cleanly
  // =========================================================
  useEffect(() => {
    setViewportOffset(0);
    setIsLiveFollowing(true);
    setVisibleCandleCount(60);
    setHoveredCandle(null);
    setHoveredPrice(null);
  }, [symbol, timeframe]);

  // =========================================================
  // 5. Explicit Viewport Zoom & Pan Controls
  // =========================================================
  const handleZoomIn = () => {
    setVisibleCandleCount((prev) => Math.max(12, Math.round(prev * 0.8)));
  };

  const handleZoomOut = () => {
    setVisibleCandleCount((prev) => Math.min(Math.max(120, candles.length), Math.round(prev * 1.25)));
  };

  const handleResetView = () => {
    setViewportOffset(0);
    setVisibleCandleCount(60);
    setIsLiveFollowing(true);
  };

  const handleSnapToLive = () => {
    setViewportOffset(0);
    setIsLiveFollowing(true);
  };

  // =========================================================
  // 6. Native Wheel Event: ONLY actual wheel/scroll triggers zoom
  // =========================================================
  useEffect(() => {
    const crosshairCanvas = crosshairCanvasRef.current;
    if (!crosshairCanvas) return;

    const onWheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
      setVisibleCandleCount((prev) => {
        const next = Math.round(prev * zoomFactor);
        return Math.max(12, Math.min(Math.max(160, candles.length), next));
      });
    };

    crosshairCanvas.addEventListener('wheel', onWheelHandler, { passive: false });
    return () => {
      crosshairCanvas.removeEventListener('wheel', onWheelHandler);
    };
  }, [candles.length]);

  // =========================================================
  // 7. Global Pointer & Mouse Drag Management for Panning
  // =========================================================
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
      }
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
    };
  }, []);

  // Compute Layout Parameters
  const padTop = 28;
  const padBottom = 32;
  const padLeft = 10;
  const padRight = 75; // Right price scale width

  const chartWidth = Math.max(100, dimensions.width - padLeft - padRight);
  const chartHeight = Math.max(100, dimensions.height - padTop - padBottom);

  // Compute Active Sliced Candles
  const totalCandles = candles.length;
  const sliceCount = Math.min(totalCandles, visibleCandleCount);
  const effectiveOffset = isLiveFollowing ? 0 : Math.min(viewportOffset, Math.max(0, totalCandles - sliceCount));
  const startIndex = Math.max(0, totalCandles - effectiveOffset - sliceCount);
  const endIndex = Math.min(totalCandles, startIndex + sliceCount);
  const visibleCandles = candles.slice(startIndex, endIndex);

  // Compute Price Bounds for Visible Window
  let minPrice = visibleCandles.length > 0 ? Math.min(...visibleCandles.map((c) => c.low)) : 0;
  let maxPrice = visibleCandles.length > 0 ? Math.max(...visibleCandles.map((c) => c.high)) : 1;

  if (showTargets && activeSignal && activeSignal.direction !== 'WAIT') {
    minPrice = Math.min(minPrice, activeSignal.stopLoss, activeSignal.takeProfit1);
    maxPrice = Math.max(maxPrice, activeSignal.stopLoss, activeSignal.takeProfit1);
    if (activeSignal.takeProfit2) {
      minPrice = Math.min(minPrice, activeSignal.takeProfit2);
      maxPrice = Math.max(maxPrice, activeSignal.takeProfit2);
    }
  }

  const pricePadding = (maxPrice - minPrice) * 0.08 || 0.001;
  const adjustedMinPrice = minPrice - pricePadding;
  const adjustedMaxPrice = maxPrice + pricePadding;
  const priceRange = adjustedMaxPrice - adjustedMinPrice || 0.001;

  const getY = (price: number) => {
    return padTop + chartHeight - ((price - adjustedMinPrice) / priceRange) * chartHeight;
  };

  const candleCount = Math.max(1, visibleCandles.length);
  const candleSpacing = chartWidth / candleCount;
  const candleWidth = Math.max(2, Math.min(32, candleSpacing * 0.72));

  const getXForVisibleIdx = (idx: number) => {
    return padLeft + idx * candleSpacing + candleSpacing / 2;
  };

  // =========================================================
  // 8. Base Canvas Render: ONLY redraws when data/viewport/overlays change
  // =========================================================
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || visibleCandles.length === 0) return;

    const width = dimensions.width;
    const height = dimensions.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid Lines & Price Axis Ticks
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    const numGridLines = 6;
    for (let i = 0; i <= numGridLines; i++) {
      const gridPrice = adjustedMinPrice + (priceRange / numGridLines) * i;
      const y = getY(gridPrice);

      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      // Price Label on Right Axis
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(gridPrice.toFixed(instrument.digits), width - padRight + 6, y + 3);
    }
    ctx.setLineDash([]);

    // Compute Indicators & Market Structure
    const indicators = computeIndicators(candles);
    const structure = analyzeMarketStructure(candles);

    // 2. Draw Support / Resistance / Supply / Demand Zones
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

    // 3. Draw EMAs (20, 50, 200) across visible window
    if (showEMAs) {
      const drawLine = (data: number[], color: string, widthPx = 1.5) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx;
        ctx.beginPath();
        let started = false;

        for (let i = 0; i < visibleCandles.length; i++) {
          const globalIdx = startIndex + i;
          const val = data[globalIdx];
          if (!val) continue;
          const x = getXForVisibleIdx(i);
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

    // 4. Draw Candlesticks
    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const x = getXForVisibleIdx(i);
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

    // 5. Draw BOS & CHoCH Market Structure Levels
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
        ctx.fillText(`BOS (${structure.lastBOS.type})`, padLeft + chartWidth - 85, y - 4);
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
        ctx.fillText(`CHoCH (${structure.lastCHoCH.type})`, padLeft + chartWidth - 95, y - 4);
      }
    }

    // 6. Draw Active Signal Targets (Entry, SL, TP1, TP2)
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

        // Label badge on price scale
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

    // 7. Draw Current Price Level & Candle Countdown Tag on Price Scale
    const latestCandle = candles[candles.length - 1];
    if (latestCandle) {
      const currentY = getY(latestCandle.close);
      const isUp = latestCandle.close >= latestCandle.open;
      const tagColor = isUp ? '#10b981' : '#f43f5e';

      // Horizontal dashed line to price scale
      ctx.strokeStyle = tagColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(padLeft, currentY);
      ctx.lineTo(width - padRight, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current Price Badge on Right Axis
      ctx.fillStyle = tagColor;
      ctx.fillRect(width - padRight, currentY - 10, padRight - 2, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(latestCandle.close.toFixed(instrument.digits), width - padRight + 4, currentY + 3);

      // Real-Time Bar Countdown Pill directly below current price tag (TradingView style)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(width - padRight, currentY + 12, padRight - 2, 16);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(width - padRight, currentY + 12, padRight - 2, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`⏱ ${countdownStr}`, width - padRight + 4, currentY + 24);
    }
  }, [
    candles,
    timeframe,
    showEMAs,
    showZones,
    showTargets,
    showBOS,
    activeSignal,
    instrument,
    dimensions,
    visibleCandleCount,
    viewportOffset,
    isLiveFollowing,
    countdownStr,
  ]);

  // =========================================================
  // 9. Overlay Crosshair Canvas Render (Smooth 60fps crosshair)
  // =========================================================
  const drawCrosshair = useCallback(
    (clientX?: number, clientY?: number) => {
      const canvas = crosshairCanvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const width = dimensions.width;
      const height = dimensions.height;

      // Sync canvas dimensions
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      if (clientX === undefined || clientY === undefined || visibleCandles.length === 0) {
        ctx.restore();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Check if within chart canvas bounds
      if (x < padLeft || x > width - padRight || y < padTop || y > height - padBottom) {
        ctx.restore();
        return;
      }

      const localIdx = Math.floor((x - padLeft) / candleSpacing);
      if (localIdx < 0 || localIdx >= visibleCandles.length) {
        ctx.restore();
        return;
      }

      const hCandle = visibleCandles[localIdx];
      const hX = getXForVisibleIdx(localIdx);
      const hY = y;

      // Draw crosshair dashed lines
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

      // Price Tag on Right Axis
      const hoverPrice = adjustedMinPrice + ((padTop + chartHeight - hY) / chartHeight) * priceRange;
      ctx.fillStyle = '#334155';
      ctx.fillRect(width - padRight, hY - 9, padRight - 2, 18);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(hoverPrice.toFixed(instrument.digits), width - padRight + 4, hY + 3);

      // Timestamp badge at bottom
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

      ctx.restore();
    },
    [
      dimensions,
      visibleCandles,
      candleSpacing,
      adjustedMinPrice,
      priceRange,
      chartHeight,
      instrument.digits,
    ]
  );

  // =========================================================
  // 10. Mouse Event Handlers (STRICT: Movement NEVER mutates zoom)
  // =========================================================
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Primary click only
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = viewportOffsetRef.current;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 1. If actively dragging/panning with mouse button held down:
    if (isDraggingRef.current && (e.buttons === 1 || e.pressure > 0)) {
      const deltaPixels = e.clientX - dragStartXRef.current;
      const candleDelta = Math.round(deltaPixels / Math.max(1, candleSpacing));

      const maxOffset = Math.max(0, totalCandles - Math.min(12, visibleCandleCountRef.current));
      const newOffset = Math.max(0, Math.min(maxOffset, dragStartOffsetRef.current + candleDelta));

      if (newOffset !== viewportOffsetRef.current) {
        setViewportOffset(newOffset);
        if (newOffset > 0) {
          setIsLiveFollowing(false);
        } else {
          setIsLiveFollowing(true);
        }
      }
      return;
    }

    // Safety: If pointer is not held down, ensure dragging is false
    if (isDraggingRef.current && e.buttons !== 1) {
      isDraggingRef.current = false;
    }

    // 2. Pure Crosshair Movement: ONLY draws crosshair and updates hover metrics
    drawCrosshair(e.clientX, e.clientY);

    const canvas = crosshairCanvasRef.current;
    if (!canvas || visibleCandles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x >= padLeft && x <= dimensions.width - padRight && y >= padTop && y <= dimensions.height - padBottom) {
      const localIdx = Math.floor((x - padLeft) / candleSpacing);
      if (localIdx >= 0 && localIdx < visibleCandles.length) {
        const c = visibleCandles[localIdx];
        setHoveredCandle(c);
        const hp = adjustedMinPrice + ((padTop + chartHeight - y) / chartHeight) * priceRange;
        setHoveredPrice(hp);
      }
    } else {
      setHoveredCandle(null);
      setHoveredPrice(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignored
    }
  };

  const handlePointerLeave = () => {
    isDraggingRef.current = false;
    drawCrosshair(); // Clear crosshair canvas
    setHoveredCandle(null);
    setHoveredPrice(null);
  };

  const activeCandle = hoveredCandle || (candles.length > 0 ? candles[candles.length - 1] : null);

  // Fullscreen Container Styling
  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-slate-950 p-4 sm:p-6 flex flex-col w-screen h-screen overflow-hidden shadow-2xl'
    : 'bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col relative shadow-sm w-full';

  return (
    <div
      ref={containerRef}
      id="trading-chart-container"
      className={containerClasses}
    >
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

          {/* Live Bar Countdown Badge */}
          <div
            id="candle-countdown-badge"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 text-sky-400 border border-sky-500/30 rounded-lg text-xs font-mono font-bold shadow-sm"
            title={`Real-Time ${timeframe} Candle Close Countdown`}
          >
            <Clock className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
            <span>Bar Close:</span>
            <span className="text-white font-bold">{countdownStr}</span>
          </div>
        </div>

        {/* Overlays, Viewport, and Fullscreen Controls */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {/* Zoom & Viewport Controls */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 mr-1">
            <button
              id="chart-zoom-in-btn"
              onClick={handleZoomIn}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              id="chart-zoom-out-btn"
              onClick={handleZoomOut}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              id="chart-reset-view-btn"
              onClick={handleResetView}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Follow Live Toggle */}
          <button
            id="chart-live-follow-btn"
            onClick={handleSnapToLive}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
              isLiveFollowing
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-sm'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/40 animate-pulse hover:bg-amber-500/20'
            }`}
            title={isLiveFollowing ? 'Live Follow Active (Pinned to latest candles)' : 'Click to Jump back to Live Candles'}
          >
            <Radio className={`w-3.5 h-3.5 ${isLiveFollowing ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{isLiveFollowing ? 'Live Follow' : 'Jump to Live ➔'}</span>
          </button>

          {/* Overlay toggles */}
          <button
            id="chart-toggle-emas-btn"
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
            id="chart-toggle-zones-btn"
            onClick={() => setShowZones(!showZones)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
              showZones
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
            title="Toggle Support & Resistance Zones"
          >
            <Layers className="w-3 h-3" />
            <span>S/R Zones</span>
          </button>

          <button
            id="chart-toggle-bos-btn"
            onClick={() => setShowBOS(!showBOS)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
              showBOS
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
            }`}
            title="Toggle Market Structure BOS/CHoCH"
          >
            <TrendingUp className="w-3 h-3" />
            <span>BOS/CHoCH</span>
          </button>

          <button
            id="chart-toggle-targets-btn"
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

          {/* FULLSCREEN BUTTON (Normal Mode vs Fullscreen Mode) */}
          <button
            id="chart-fullscreen-toggle-btn"
            onClick={toggleFullscreen}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold border transition-all ${
              isFullscreen
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30'
                : 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 hover:bg-indigo-600/30 hover:text-white'
            }`}
            title={isFullscreen ? 'Exit Fullscreen Mode (ESC)' : 'Expand Chart to Fullscreen Mode'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* OHLCV Stat Ribbon with Live Countdown */}
      {activeCandle && (
        <div className="flex items-center gap-4 py-1.5 px-3 text-[11px] font-mono text-slate-400 bg-slate-950/60 rounded border border-slate-800/60 flex-wrap justify-between my-2">
          <div className="flex items-center gap-4 flex-wrap">
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
              C:{' '}
              <span
                className={`font-bold ${
                  activeCandle.close >= activeCandle.open ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {activeCandle.close.toFixed(instrument.digits)}
              </span>
            </span>
            <span>
              Vol: <span className="text-slate-300">{activeCandle.volume.toLocaleString()}</span>
            </span>
            <span className="hidden sm:inline text-slate-500">
              Time:{' '}
              {new Date(activeCandle.time).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sky-400 font-semibold text-[10px]">
              {timeframe} Bar Ends in: <span className="text-white font-bold">{countdownStr}</span>
            </span>
            {!hoveredCandle && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-950/70 text-blue-300 border border-blue-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
                FORMING
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Dual-Layer Interactive Chart Container */}
      <div
        className={`relative w-full flex-1 bg-slate-950 rounded-lg border border-slate-800/80 overflow-hidden flex items-center justify-center select-none ${
          isFullscreen ? 'min-h-[500px]' : 'min-h-[380px]'
        }`}
      >
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
          <div className="relative w-full h-full">
            {/* Layer 1: Base Candlestick & Indicators Canvas */}
            <canvas
              id="trading-chart-base-canvas"
              ref={mainCanvasRef}
              className="absolute inset-0 w-full h-full block"
            />
            {/* Layer 2: Interactive Crosshair & Pan Canvas */}
            <canvas
              id="trading-chart-crosshair-canvas"
              ref={crosshairCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              className="absolute inset-0 w-full h-full cursor-crosshair block touch-none z-10"
            />
          </div>
        )}
      </div>

      {/* Chart Footer Legend */}
      <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-slate-800 text-[11px] text-slate-400">
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

        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
          <span>Click & Drag to Pan</span>
          <span>•</span>
          <span>Scroll to Zoom</span>
          <span>•</span>
          <span className="text-sky-400">{isFullscreen ? 'Fullscreen Active' : 'Live Viewport Preserved'}</span>
        </div>
      </div>
    </div>
  );
};
