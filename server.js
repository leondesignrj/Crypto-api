import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   CONFIG
========================= */

const BINANCE_URL = "https://api.binance.com/api/v3/klines";
const DAILY_INTERVAL = "1d";
const MAX_LIMIT = 1000;

/* =========================
   HELPERS
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

  for (let i = values.length - period - 1; i < values.length - 1; i++) {
    const diff = values[i + 1] - values[i];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function avg(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* =========================
   DATA FETCH
========================= */

async function fetchAllDailyCandles(symbol) {
  let candles = [];
  let endTime = Date.now();

  while (true) {
    const res = await axios.get(BINANCE_URL, {
      params: {
        symbol,
        interval: DAILY_INTERVAL,
        limit: MAX_LIMIT,
        endTime
      }
    });

    if (res.data.length === 0) break;

    candles = [...res.data, ...candles];
    endTime = res.data[0][0] - 1;

    if (res.data.length < MAX_LIMIT) break;
  }

  return candles;
}

/* =========================
   ANALYSIS CORE
========================= */

function analyzeMarket(candles) {
  const closes = candles.map(c => parseFloat(c[4]));
  const volumes = candles.map(c => parseFloat(c[5]));

  const ema50 = EMA(closes.slice(-50), 50);
  const ema200 = EMA(closes.slice(-200), 200);
  const lastClose = closes[closes.length - 1];

  const rsi = RSI(closes);
  const avgVolume = avg(volumes.slice(-30));
  const lastVolume = volumes[volumes.length - 1];

  /* ---- Structure ---- */
  let trend = "neutral";
  if (lastClose > ema50 && ema50 > ema200) trend = "bullish";
  if (lastClose < ema50 && ema50 < ema200) trend = "bearish";

  /* ---- Momentum ---- */
  let momentum = false;
  if (trend === "bullish" && rsi >= 55 && rsi <= 70) momentum = true;
  if (trend === "bearish" && rsi <= 45 && rsi >= 30) momentum = true;

  /* ---- Volume ---- */
  const volumeConfirmed = lastVolume > avgVolume * 1.2;

  /* ---- Scoring ---- */
  let score = 0;
  let contributors = [];

  if (trend !== "neutral") {
    score += 2;
    contributors.push("structure");
  }
  if (momentum) {
    score += 1;
    contributors.push("momentum");
  }
  if (volumeConfirmed) {
    score += 1;
    contributors.push("volume");
  }

  /* ---- Strength ---- */
  let level = "INVALID";
  if (score >= 2) level = "VALID";
  if (score >= 4) level = "STRONG";

  /* ---- Percentages ---- */
  const continuation = Math.min(75, score * 15);
  const reversal = 100 - continuation;

  /* ---- Signal Type ---- */
  let signal = "HOLD";
  if (level === "STRONG" && Math.abs(rsi - 50) < 5) signal = "SCALP";
  if (level === "STRONG" && Math.abs(rsi - 50) >= 5) signal = "SWING";

  /* ---- Invalidation ---- */
  let invalidation;
  if (trend === "bullish") invalidation = ema50;
  if (trend === "bearish") invalidation = ema50;

  return {
    trend,
    rsi: Number(rsi.toFixed(2)),
    volumeRatio: Number((lastVolume / avgVolume).toFixed(2)),
    score,
    strength: {
      level,
      contributors
    },
    continuation: Number(continuation.toFixed(2)),
    reversal: Number(reversal.toFixed(2)),
    signal,
    invalidation: Number(invalidation.toFixed(4)),
    horizons: {
      "7d": continuation + 5,
      "30d": continuation,
      "90d": continuation - 10
    }
  };
}

/* =========================
   ROUTE
========================= */

app.get("/analyze", async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const candles = await fetchAllDailyCandles(symbol.toUpperCase());
    if (candles.length < 200) {
      return res.status(400).json({ error: "not enough historical data" });
    }

    const analysis = analyzeMarket(candles);

    res.json({
      symbol: symbol.toUpperCase(),
      ...analysis
    });
  } catch (err) {
    res.status(500).json({
      error: "analysis failed",
      details: err.message
    });
  }
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
