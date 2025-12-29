// server.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   CONFIG
========================= */
const BINANCE_BASE = "https://api.binance.com";
const PORT = process.env.PORT || 10000;

/* =========================
   RUTA BASE
========================= */
app.get("/", (req, res) => {
  res.send("API crypto funcionando");
});

/* =========================
   HELPERS
========================= */
function ema(data, period) {
  const k = 2 / (period + 1);
  let emaArray = [data[0]];
  for (let i = 1; i < data.length; i++) {
    emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
  }
  return emaArray;
}

function rsi(data, period) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    diff >= 0 ? (gains += diff) : (losses -= diff);
  }
  let rs = gains / (losses || 1);
  let rsiArr = [100 - 100 / (1 + rs)];

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    diff >= 0
      ? (gains = (gains * (period - 1) + diff) / period)
      : (losses = (losses * (period - 1) - diff) / period);
    rs = gains / (losses || 1);
    rsiArr.push(100 - 100 / (1 + rs));
  }
  return rsiArr;
}

/* =========================
   BINANCE DATA
========================= */
async function getHistorical(symbol, interval = "1d", limit = 200) {
  const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await axios.get(url);
  return res.data.map(k => ({
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

async function getOrderBook(symbol) {
  const url = `${BINANCE_BASE}/api/v3/depth?symbol=${symbol}&limit=100`;
  const res = await axios.get(url);
  const bids = res.data.bids.reduce((s, b) => s + parseFloat(b[1]), 0);
  const asks = res.data.asks.reduce((s, a) => s + parseFloat(a[1]), 0);
  return bids / (asks || 1);
}

/* =========================
   SENTIMIENTO (MOCK CONTROLADO)
   - luego se conecta a news / social
========================= */
function getSentimentScore() {
  return (Math.random() * 2 - 1).toFixed(2); // -1 a +1
}

/* =========================
   MARKET SCORE ENGINE
========================= */
function calculateMarketScore({ trend, confidence, volumeRatio, orderbookRatio, sentiment }) {
  let score = 0;

  // Tendencia técnica
  score += confidence * 0.4;

  // Volumen
  if (volumeRatio > 1.3) score += 10;
  else if (volumeRatio < 0.6) score -= 10;

  // Order book
  if (trend === "bullish" && orderbookRatio > 1.2) score += 15;
  else if (trend === "bearish" && orderbookRatio < 0.8) score += 15;
  else score -= 20;

  // Sentimiento
  score += sentiment * 10;

  return Math.round(score);
}

function classifySignal(score) {
  if (score >= 75) return "STRONG";
  if (score >= 60) return "VALID";
  if (score >= 45) return "WEAK";
  return "INVALID";
}

/* =========================
   ENDPOINT PRINCIPAL
========================= */
app.get("/predict", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase();

    const historical = await getHistorical(symbol);
    const closes = historical.map(c => c.close);
    const volumes = historical.map(v => v.volume);

    const shortEMA = ema(closes, 20).pop();
    const longEMA = ema(closes, 50).pop();
    const rsiVal = rsi(closes, 14).pop();

    let trend = "neutral";
    if (shortEMA > longEMA && rsiVal > 50) trend = "bullish";
    if (shortEMA < longEMA && rsiVal < 50) trend = "bearish";

    const volRecent = volumes.slice(-7).reduce((a, b) => a + b, 0);
    const volAvg = volumes.slice(-30).reduce((a, b) => a + b, 0) / 30;
    const volumeRatio = volRecent / (volAvg * 7 || 1);

    const orderbookRatio = await getOrderBook(symbol);
    const sentiment = parseFloat(getSentimentScore());

    const confidence = Math.min(
      100,
      Math.abs(shortEMA - longEMA) * 100 + Math.abs(rsiVal - 50)
    );

    const marketScore = calculateMarketScore({
      trend,
      confidence,
      volumeRatio,
      orderbookRatio,
      sentiment
    });

    res.json({
      symbol,
      trend,
      confidence: Number(confidence.toFixed(2)),
      market_score: marketScore,
      signal_strength: classifySignal(marketScore),
      signal_type: marketScore >= 60 ? "SCALP" : "HOLD",
      volume_ratio: Number(volumeRatio.toFixed(2)),
      orderbook_ratio: Number(orderbookRatio.toFixed(2)),
      sentiment,
      rsi: Number(rsiVal.toFixed(2)),
      invalidated_if: [
        "market_score < 45",
        "RSI crosses 50 against trend",
        "orderbook contradicts trend",
        "volume_ratio < 0.6"
      ]
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Prediction failed" });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
