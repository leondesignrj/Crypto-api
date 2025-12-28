// server.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// --- RUTA BASE ---
app.get("/", (req, res) => {
  res.send("API crypto funcionando");
});

// --- FUNCIONES DEL ALGORITMO ---

async function getHistorical(symbol = "BTCUSDT", interval = "1m", limit = 50) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await axios.get(url, { timeout: 5000 });
    return response.data.map(k => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err.message);
    return null; // Retorna null si hay error
  }
}

function ema(data, period) {
  const k = 2 / (period + 1);
  const emaArray = [data[0]];
  for (let i = 1; i < data.length; i++) {
    emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
  }
  return emaArray;
}

function rsi(data, period) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let rs = gains / (losses || 1);
  const rsiArray = [100 - 100 / (1 + rs)];
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains = (gains * (period - 1) + diff) / period;
    else losses = (losses * (period - 1) - diff) / period;
    rs = gains / (losses || 1);
    rsiArray.push(100 - 100 / (1 + rs));
  }
  return rsiArray;
}

const SHORT_EMA = 10;
const LONG_EMA = 50;
const RSI_PERIOD = 14;

async function predictTrend(symbol) {
  const historical = await getHistorical(symbol);
  if (!historical) return { symbol, trend: "error" };

  const closes = historical.map(c => c.close);
  if (closes.length < LONG_EMA) return { symbol, trend: "not enough data" };

  const shortEMA = ema(closes, SHORT_EMA).pop();
  const longEMA = ema(closes, LONG_EMA).pop();
  const lastRSI = rsi(closes, RSI_PERIOD).pop();

  let trend = "neutral";
  if (shortEMA > longEMA && lastRSI < 70) trend = "bullish";
  else if (shortEMA < longEMA && lastRSI > 30) trend = "bearish";

  return { symbol, trend, shortEMA, longEMA, lastRSI };
}

// --- ENDPOINTS ---

app.get("/predict/stable", async (req, res) => {
  const symbols = ["BTCUSDT", "ETHUSDT"];
  const results = [];
  for (const symbol of symbols) {
    const trend = await predictTrend(symbol);
    results.push(trend);
  }
  res.json({ category: "stable", data: results });
});

app.get("/predict/alt", async (req, res) => {
  const symbols = ["DOGEUSDT", "LTCUSDT"];
  const results = [];
  for (const symbol of symbols) {
    const trend = await predictTrend(symbol);
    results.push(trend);
  }
  res.json({ category: "alt", data: results });
});

// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
