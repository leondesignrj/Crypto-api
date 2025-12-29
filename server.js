import express from "express";
import axios from "axios";

const app = express();
const PORT = 10000;

const BINANCE_API = "https://api.binance.com/api/v3";

/* =========================
   CONFIGURACIÓN BASE
========================= */

const BASE_INTERVAL = "1d";
const BASE_LIMIT = 1000;

/* =========================
   UTILIDADES
========================= */

function EMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function RSI(values, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* =========================
   MARKET DATA
========================= */

async function getKlines(symbol) {
  const { data } = await axios.get(`${BINANCE_API}/klines`, {
    params: {
      symbol,
      interval: BASE_INTERVAL,
      limit: BASE_LIMIT,
    },
  });

  return data.map(k => ({
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function getOrderBook(symbol) {
  const { data } = await axios.get(`${BINANCE_API}/depth`, {
    params: { symbol, limit: 50 },
  });

  const bids = data.bids.reduce((a, b) => a + parseFloat(b[1]), 0);
  const asks = data.asks.reduce((a, b) => a + parseFloat(b[1]), 0);

  return bids / (asks || 1);
}

/* =========================
   SENTIMIENTO (placeholder)
========================= */

function getSentimentScore() {
  // placeholder: luego se conecta a noticias / social
  return clamp(Math.random(), 0.3, 0.7);
}

/* =========================
   ANÁLISIS PRINCIPAL
========================= */

async function analyzeSymbol(symbol) {
  const klines = await getKlines(symbol);
  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);

  const emaShort = EMA(closes.slice(-50), 50);
  const emaLong = EMA(closes.slice(-200), 200);
  const rsi = RSI(closes.slice(-15));

  const volumeAvg = volumes.slice(-30).reduce((a, b) => a + b, 0) / 30;
  const volumeRatio = volumes[volumes.length - 1] / (volumeAvg || 1);

  const orderbookRatio = await getOrderBook(symbol);
  const sentiment = getSentimentScore();

  /* =========================
     TREND BASE
  ========================= */

  let trend = "neutral";
  if (emaShort > emaLong) trend = "bullish";
  if (emaShort < emaLong) trend = "bearish";

  /* =========================
     MARKET SCORE (0–100)
  ========================= */

  let marketScore = 0;
  if (trend !== "neutral") marketScore += 25;
  if (volumeRatio > 0.8) marketScore += 20;
  if (orderbookRatio > 1 && trend === "bullish") marketScore += 20;
  if (orderbookRatio < 1 && trend === "bearish") marketScore += 20;
  if (rsi > 40 && rsi < 60) marketScore += 15;

  marketScore = clamp(marketScore, 0, 100);

  /* =========================
     CONFIDENCE NORMALIZADO
  ========================= */

  const confidence = clamp(
    marketScore * 0.6 +
    sentiment * 20 +
    volumeRatio * 20,
    0,
    100
  );

  /* =========================
     INVALIDACIÓN / NO TRADE
  ========================= */

  let signal_strength = "VALID";
  let signal_type = "SWING";

  const invalidations = [];

  if (marketScore < 45) invalidations.push("market_score < 45");
  if (volumeRatio < 0.6) invalidations.push("volume_ratio < 0.6");
  if (
    (trend === "bullish" && orderbookRatio < 1) ||
    (trend === "bearish" && orderbookRatio > 1)
  ) invalidations.push("orderbook contradicts trend");

  if (invalidations.length >= 3) {
    signal_strength = "INVALID";
    signal_type = "HOLD";
  } else if (invalidations.length >= 1) {
    signal_strength = "NO_TRADE";
    signal_type = "HOLD";
  } else if (confidence > 65) {
    signal_strength = "STRONG";
    signal_type = "SWING";
  }

  if (signal_strength !== "STRONG" && Math.abs(rsi - 50) < 5) {
    signal_type = "SCALP";
  }

  /* =========================
     HORIZONTES (CONTEXTO)
  ========================= */

  const timeframes = {
    "7d": {
      bias: trend,
      score: clamp(marketScore - 5, 0, 100),
      confidence: clamp(confidence / 100, 0, 1),
    },
    "30d": {
      bias: trend,
      score: clamp(marketScore, 0, 100),
      confidence: clamp(confidence / 100, 0, 1),
    },
    "90d": {
      bias: trend === "bullish" ? "bullish" : "neutral",
      score: clamp(marketScore + 5, 0, 100),
      confidence: clamp(confidence / 100, 0, 1),
    },
  };

  return {
    symbol,
    trend,
    confidence: Number(confidence.toFixed(2)),
    market_score: marketScore,
    signal_strength,
    signal_type,
    volume_ratio: Number(volumeRatio.toFixed(2)),
    orderbook_ratio: Number(orderbookRatio.toFixed(2)),
    sentiment: Number(sentiment.toFixed(2)),
    rsi: Number(rsi.toFixed(2)),
    invalidated_if: invalidations,
    timeframes,
  };
}

/* =========================
   ENDPOINT
========================= */

app.get("/analyze", async (req, res) => {
  try {
    const symbol = req.query.symbol || "ETHUSDT";
    const result = await analyzeSymbol(symbol.toUpperCase());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
