// server.cjs
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =========================
   UTILIDADES
========================= */

function clamp(n, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function labelSentiment(score) {
  if (score < 0.35) return "bearish";
  if (score < 0.45) return "slightly bearish";
  if (score < 0.55) return "neutral";
  if (score < 0.65) return "slightly bullish";
  return "bullish";
}

/* =========================
   INDICADORES
========================= */

function ema(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function rsi(data, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

/* =========================
   BINANCE DATA
========================= */

async function getDailyHistory(symbol, limit = 365) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
  const res = await axios.get(url, { timeout: 8000 });
  return res.data.map(c => ({
    close: Number(c[4]),
    volume: Number(c[5])
  }));
}

/* =========================
   SENTIMIENTO - NOTICIAS
========================= */

async function getNewsSentiment(symbol) {
  try {
    // CryptoPanic demo (sin key = neutral controlado)
    // En producción: agregar ?auth_token=TU_API_KEY
    const url = `https://cryptopanic.com/api/v1/posts/?currencies=${symbol.replace("USDT","")}`;
    const res = await axios.get(url, { timeout: 5000 });

    let pos = 0, neg = 0;

    res.data.results.slice(0, 20).forEach(n => {
      if (n.vote === "positive") pos++;
      if (n.vote === "negative") neg++;
    });

    if (pos + neg === 0) return 0.5;
    return clamp((pos - neg) / (pos + neg) * 0.5 + 0.5);
  } catch {
    return 0.5; // fallback seguro
  }
}

/* =========================
   SENTIMIENTO - REDDIT
========================= */

async function getRedditSentiment(symbol) {
  try {
    // Placeholder agregado (sin scraping peligroso)
    // Se reemplaza luego por Pushshift / API Reddit
    const mentionRatio = Math.random(); // simulado
    const polarity = Math.random() * 0.2 - 0.1;

    return clamp(0.5 + polarity + (mentionRatio - 0.5) * 0.2);
  } catch {
    return 0.5;
  }
}

/* =========================
   ANALISIS PRINCIPAL
========================= */

async function analyze(symbol) {
  const data = await getDailyHistory(symbol);
  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume);

  const shortEMA = ema(closes.slice(-30), 10);
  const longEMA = ema(closes.slice(-90), 50);
  const rsiVal = rsi(closes.slice(-15));

  let trend = "neutral";
  if (shortEMA > longEMA) trend = "bullish";
  if (shortEMA < longEMA) trend = "bearish";

  const volumeRatio = volumes.at(-1) / (volumes.slice(-30).reduce((a,b)=>a+b,0)/30);

  const news = await getNewsSentiment(symbol);
  const reddit = await getRedditSentiment(symbol);

  const sentiment = clamp(news * 0.6 + reddit * 0.4);

  let confidence = 50;
  if (trend === "bullish") confidence += 10;
  if (trend === "bearish") confidence += 10;

  const invalidated = [];

  if (volumeRatio < 0.6) invalidated.push("low volume");

  if (trend === "bullish" && sentiment < 0.35)
    invalidated.push("sentiment contradicts trend");

  if (trend === "bearish" && sentiment > 0.65)
    invalidated.push("sentiment contradicts trend");

  const signal_strength = invalidated.length ? "INVALID" : "VALID";

  return {
    symbol,
    trend,
    confidence: Math.round(confidence),
    signal_strength,
    signal_type: signal_strength === "VALID" ? "TRADE" : "NO_TRADE",
    rsi: Number(rsiVal.toFixed(2)),
    volume_ratio: Number(volumeRatio.toFixed(2)),
    sentiment: {
      score: Number(sentiment.toFixed(2)),
      news: Number(news.toFixed(2)),
      reddit: Number(reddit.toFixed(2)),
      label: labelSentiment(sentiment)
    },
    horizons: {
      "7d": confidence - 5,
      "30d": confidence,
      "90d": confidence - 10
    },
    invalidated_if: invalidated
  };
}

/* =========================
   ENDPOINT
========================= */

app.get("/analyze", async (req, res) => {
  const symbol = req.query.symbol || "BTCUSDT";
  try {
    const result = await analyze(symbol);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "analysis failed" });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
