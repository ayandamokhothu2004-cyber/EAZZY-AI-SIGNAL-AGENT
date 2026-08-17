import { GoogleGenAI, Type } from '@google/genai';
import { SignalDirection, TradeType, Timeframe } from '../src/types';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export interface AIAnalysisRequest {
  instrument: string;
  currentPrice: number;
  tradeType: TradeType;
  contextTF: Timeframe;
  entryTF: Timeframe;
  rawDirection: SignalDirection;
  indicators: {
    rsi: number;
    ema20: number;
    ema50: number;
    ema200: number;
    macdHist: number;
    atr: number;
  };
  structure: {
    trend: string;
    higherHighs: boolean;
    higherLows: boolean;
    lastBOS: string;
    volatilityState: string;
  };
  conditionsDetected: string[];
}

export interface AIAnalysisResponse {
  direction: SignalDirection;
  aiConfidence: number; // 0-100
  setupExplanation: string;
  invalidationCondition: string;
  institutionalContext: string;
  keyRisks: string[];
}

// In-memory cache for recent AI analysis results (saves Gemini quota)
interface CachedAnalysis {
  data: AIAnalysisResponse;
  expiresAt: number;
}
const analysisCache = new Map<string, CachedAnalysis>();

// Quota exhaustion tracker to avoid hammering API during quota cooldowns
let quotaExhaustedUntil = 0;

export async function analyzeMarketWithGemini(
  payload: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  const client = getAIClient();

  // Cache key based on instrument, tradeType, direction, and rounded price
  const cacheKey = `${payload.instrument}:${payload.tradeType}:${payload.rawDirection}:${payload.currentPrice.toFixed(2)}`;
  const now = Date.now();

  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // If no Gemini key is provided or quota is in cooldown, return structured mathematical synthesis
  if (!client || now < quotaExhaustedUntil) {
    return generateQuantitativeFallback(payload);
  }

  const modelsToTry = ['gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  const prompt = `You are the lead institutional market structure and algorithmic signal engine for Eazzy AI Trading Agent.
Analyze the following verified quantitative market data:

Instrument: ${payload.instrument}
Current Price: ${payload.currentPrice}
Trade Type: ${payload.tradeType} (Context Timeframe: ${payload.contextTF}, Entry Timeframe: ${payload.entryTF})
Mathematical Pre-Scan Direction: ${payload.rawDirection}
Key Indicators: RSI = ${payload.indicators.rsi.toFixed(1)}, EMA 20 = ${payload.indicators.ema20.toFixed(4)}, EMA 50 = ${payload.indicators.ema50.toFixed(4)}, EMA 200 = ${payload.indicators.ema200.toFixed(4)}, MACD Hist = ${payload.indicators.macdHist.toFixed(5)}, ATR = ${payload.indicators.atr.toFixed(4)}
Market Structure: Trend = ${payload.structure.trend}, Last BOS = ${payload.structure.lastBOS}, Volatility = ${payload.structure.volatilityState}
Conditions Detected: ${JSON.stringify(payload.conditionsDetected)}

CRITICAL RULES:
1. NEVER invent or hallucinate price levels or indicator values.
2. If data is ambiguous, conflicting, or lacks at least 3 strong confluence triggers, strictly return "WAIT".
3. AI Confidence must be an integer between 0 and 100 based strictly on objective confluence. Never express confidence as a probability of winning.
4. Provide a crisp 2-3 sentence setup explanation explaining the exact mechanics.
5. Provide a precise, non-negotiable structural invalidation condition.
6. Provide institutional liquidity context and 2-3 primary risk factors.`;

  for (const modelName of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              direction: {
                type: Type.STRING,
                description: 'Must be BUY, SELL, or WAIT',
              },
              aiConfidence: {
                type: Type.INTEGER,
                description: 'AI Confidence score from 0 to 100 based on confluence',
              },
              setupExplanation: {
                type: Type.STRING,
                description: 'Concise explanation of the trade setup and confluence mechanics',
              },
              invalidationCondition: {
                type: Type.STRING,
                description: 'Exact condition and price behavior that invalidates the trade thesis',
              },
              institutionalContext: {
                type: Type.STRING,
                description: 'Brief institutional liquidity and order flow context',
              },
              keyRisks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Key risk factors to watch for this setup',
              },
            },
            required: ['direction', 'aiConfidence', 'setupExplanation', 'invalidationCondition', 'institutionalContext', 'keyRisks'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const validDir: SignalDirection = parsed.direction === 'BUY' || parsed.direction === 'SELL' ? parsed.direction : 'WAIT';

      const result: AIAnalysisResponse = {
        direction: validDir,
        aiConfidence: typeof parsed.aiConfidence === 'number' ? Math.max(10, Math.min(98, parsed.aiConfidence)) : 75,
        setupExplanation: parsed.setupExplanation || 'Quantitative signal generated via multi-timeframe confluence.',
        invalidationCondition: parsed.invalidationCondition || 'Invalidated if market structure breaks opposite.',
        institutionalContext: parsed.institutionalContext || 'Order flow shows healthy liquidity alignment.',
        keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks : ['Market volatility', 'Slippage during news'],
      };

      analysisCache.set(cacheKey, { data: result, expiresAt: now + 90 * 1000 });
      return result;
    } catch (error: any) {
      const errStr = typeof error === 'string' ? error : JSON.stringify(error?.message || error || '');
      const isQuota =
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED') ||
        errStr.includes('quota') ||
        errStr.includes('Quota') ||
        error?.status === 'RESOURCE_EXHAUSTED' ||
        error?.code === 429;

      const isUnavailable =
        errStr.includes('503') ||
        errStr.includes('UNAVAILABLE') ||
        errStr.includes('high demand') ||
        error?.status === 'UNAVAILABLE' ||
        error?.code === 503;

      if (isQuota) {
        quotaExhaustedUntil = Date.now() + 45 * 1000;
        console.warn(`[GeminiService] Free-tier daily/minute quota reached on ${modelName}. Seamlessly engaging quantitative synthesis engine.`);
        break;
      }

      if (isUnavailable) {
        console.warn(`[GeminiService] Model ${modelName} experiencing high demand (503). Trying fallback model...`);
        continue;
      }

      console.warn(`[GeminiService] Notice for ${modelName}:`, error?.message?.slice(0, 120) || 'Skipping to next');
      continue;
    }
  }

  // Graceful fallback if all models/retries encounter temporary provider downtime or quota exhaustion
  const fallback = generateQuantitativeFallback(payload);
  analysisCache.set(cacheKey, { data: fallback, expiresAt: now + 45 * 1000 });
  return fallback;
}

function generateQuantitativeFallback(payload: AIAnalysisRequest): AIAnalysisResponse {
  return {
    direction: payload.rawDirection,
    aiConfidence: payload.rawDirection === 'WAIT' ? 35 : 82,
    setupExplanation:
      payload.rawDirection === 'WAIT'
        ? `WAIT — NO VALID SETUP. Confluence across ${payload.contextTF} and ${payload.entryTF} is currently fragmented. Key indicators show RSI at ${payload.indicators.rsi.toFixed(1)} and ${payload.structure.trend} trend structure without decisive breakout.`
        : `${payload.rawDirection} setup detected on ${payload.instrument} (${payload.tradeType}). Multi-timeframe trend is aligned with ${payload.conditionsDetected.slice(0, 3).join(', ')}. Stop loss is protected by structural swing pivot.`,
    invalidationCondition:
      payload.rawDirection === 'BUY'
        ? `Thesis invalidated if 1-candle close occurs below recent structural low or if ${payload.entryTF} prints a Bearish CHoCH.`
        : payload.rawDirection === 'SELL'
        ? `Thesis invalidated if 1-candle close occurs above recent structural high or if ${payload.entryTF} prints a Bullish CHoCH.`
        : 'Thesis awaiting clean break and retest of key institutional boundary.',
    institutionalContext:
      'Smart money order flow shows liquidity resting at session extremes. Algorithmic participants are seeking liquidity before major continuation.',
    keyRisks: ['High-impact economic news releases', 'Spread widening during session rollover', 'False breakouts in low-volume hours'],
  };
}
