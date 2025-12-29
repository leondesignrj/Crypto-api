const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   CONFIG
========================= */

const PORT = process.env.PORT || 10000;
const BINANCE_URL = "https://api.binance.com/api/v3/klines";

// indicadores
const RSI_PERIOD = 14;
const SHORT_EMA = 20;
const LONG_EMA = 50;

// pesos para confidence
const WEIGHTS = {
  trend: 40,
  rsi: 20,
  volume: 15,
  orderbook: 15,
  sentiment: 10
};

/* =========================
   UTILIDADES
========================= */

function ema(data, period) {
  const k = 2 / (period + 1);
  let emaPrev = data[0];
  for (let i = 1; i < data.length; i++) {
    emaPrev = data[i] * k + emaPrev * (1 - k);
  }
  return emaPrev;
}

function rsi(data, period) {
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let rs = gains / (losses || 1);
  let rsiVal = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains = (gains * (period - 1) + diff) / period;
    else losses = (losses * (period - 1) - diff) / period;

    rs = gains / (losses || 1);
    rsiVal = 100 - 100 / (1 + rs);
  }

  return rsiVal;
}

/* =========================
   DATA BINANCE
========================= */

async function getDailyHistory(symbol) {
  try {
    const res = await axios.get(BINANCE_URL, {
      params: {
        symbol,
        interval: "1d",
        limit: 1000
      },
      timeout: 8000
    });

    return res.data.map(k => ({
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      volume: +k[5]
    }));
  } catch (err) {
    return null;
  }
}

/* =========================
   CORE ANALYSIS
========================= */

async function analyzeSymbol(symbol) {
  const history = await getDailyHistory(symbol);
  if (!history || history.length < LONG_EMA) {
    return { symbol, error: "Not enough data" };
  }

  const closes = history.map(c => c.close);
  const volumes = history.map(c => c.volume);

  const shortEMA = ema(closes.slice(-SHORT_EMA), SHORT_EMA);
  const longEMA = ema(closes.slice(-LONG_EMA), LONG_EMA);
  const lastRSI = rsi(closes.slice(-(RSI_PERIOD + 1)), RSI_PERIOD);

  const trend =
    shortEMA > longEMA ? "bullish" :
    shortEMA < longEMA ? "bearish" :
    "neutral";

  /* -------- SCORE COMPONENTS -------- */

  const trendScore =
    trend === "bullish" ? 100 :
    trend === "bearish" ? 100 :
    50;

  const rsiScore =
    trend === "bullish" ? Math.max(0, 100 - Math.abs(50 - lastRSI) * 2) :
    trend === "bearish" ? Math.max(0, 100 - Math.abs(50 - lastRSI) * 2) :
    50;

  const avgVolume = volumes.slice(-30).reduce((a, b) => a + b, 0) / 30;
  const volumeRatio = volumes.at(-1) / avgVolume;
  const volumeScore = Math.min(100, volumeRatio * 100);

  // orderbook y sentimiento simulados (placeholder)
  const orderbookRatio = 1;
  const orderbookScore = 50;

  const sentiment = 0.5;
  const sentimentScore = sentiment * 100;

  /* -------- CONFIDENCE NORMALIZADO -------- */

  const confidence =
    trendScore * WEIGHTS.trend / 100 +
    rsiScore * WEIGHTS.rsi / 100 +
    volumeScore * WEIGHTS.volume / 100 +
    orderbookScore * WEIGHTS.orderbook / 100 +
    sentimentScore * WEIGHTS.sentiment / 100;

  const confidenceRounded = Math.round(confidence * 100) / 100;

  /* -------- INVALIDATION RULES -------- */

  const invalidations = [];

  if (confidenceRounded < 45) invalidations.push("confidence < 45");
  if (trend === "bullish" && lastRSI > 70) invalidations.push("RSI overbought");
  if (trend === "bearish" && lastRSI < 30) invalidations.push("RSI oversold");
  if (volumeRatio < 0.6) invalidations.push("low volume");

  const signalStrength =
    invalidations.length > 0 ? "INVALID" :
    confidenceRounded >= 70 ? "STRONG" :
    "WEAK";

  const signalType =
    signalStrength === "INVALID" ? "NO_TRADE" :
    trend === "bullish" ? "LONG" :
    trend === "bearish" ? "SHORT" :
    "HOLD";

  /* -------- TIME HORIZONS -------- */

  const horizons = {
    "7d": Math.max(0, Math.min(100, confidenceRounded + (trend === "bullish" ? 5 : -5))),
    "30d": confidenceRounded,
    "90d": Math.max(0, Math.min(100, confidenceRounded - 10))
  };

  return {
    symbol,
    trend,
    confidence: confidenceRounded,
    signal_strength: signalStrength,
    signal_type: signalType,
    rsi: Math.round(lastRSI * 100) / 100,
    volume_ratio: Math.round(volumeRatio * 100) / 100,
    sentiment,
    horizons,
    invalidated_if: invalidations
  };
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("Crypto API running");
});

app.get("/analyze", async (req, res) => {
  const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();
  const result = await analyzeSymbol(symbol);
  res.json(result);
});

/* =========================
   SERVER
========================= */

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
