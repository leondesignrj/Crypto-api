// server.js
const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());  // necesario para futuros POST

// --- RUTA BASE ---
app.get("/", (req, res) => {
  res.send("API crypto funcionando");
});

// --- FUNCIONES DEL ALGORITMO ---

// Obtener datos históricos de Binance
async function getHistorical(symbol = "BTCUSDT", interval = "1m", limit = 100) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await axios.get(url, { timeout: 5000 });
  return res.data.map(k => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

// EMA
function ema(data, period) {
  let k = 2 / (period + 1);
  let emaArray = [data[0]];
  for (let i = 1; i < data.length; i++) {
    emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
  }
  return emaArray;
}

// RSI
function rsi(data, period) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    let diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let rs = gains / (losses || 1);
  let rsiArray = [100 - 100 / (1 + rs)];
  for (let i = period + 1; i < data.length; i++) {
    let diff = data[i] - data[i - 1];
    if (diff >= 0) gains = (gains * (period - 1) + diff) / period;
    else losses = (losses * (period - 1) - diff) / period;
    rs = gains / (losses || 1);
    rsiArray.push(100 - 100 / (1 + rs));
  }
  return rsiArray;
}

// Algoritmo principal de predicción
const SHORT_EMA = 10;
const LONG_EMA = 50;
const RSI_PERIOD = 14;

async function predictTrend(symbol = "BTCUSDT") {
  try {
    const historical = await getHistorical(symbol, "1m", 100);
    const closes = historical.map(c => c.close);

    const shortEMA = ema(closes, SHORT_EMA).pop();
    const longEMA = ema(closes, LONG_EMA).pop();
    const lastRSI = rsi(closes, RSI_PERIOD).pop();

    let trend = "neutral";
    if (shortEMA > longEMA && lastRSI < 70) trend = "bullish";
    else if (shortEMA < longEMA && lastRSI > 30) trend = "bearish";

    return { symbol, trend, shortEMA, longEMA, lastRSI };
  } catch (err) {
    console.error("Prediction error:", err.message);
    return { symbol, trend: "error" };
  }
}

// --- ENDPOINTS PARA CATEGORÍAS ---

// Stable / BTC/ETH
app.get("/predict/stable", async (req, res) => {
  try {
    const results = [];
    for (let symbol of ["BTCUSDT", "ETHUSDT"]) {
      const trend = await predictTrend(symbol);
      results.push(trend);
    }
    res.json({ category: "stable", data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Altcoins
app.get("/predict/alt", async (req, res) => {
  try {
    const symbols = ["LBRUSDT", "DOGEUSDT", "LTCUSDT"];
    const results = [];
    for (let symbol of symbols) {
      const trend = await predictTrend(symbol);
      results.push(trend);
    }
    res.json({ category: "alt", data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- LEVANTAR SERVIDOR ---
app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor activo en puerto 3000");
});
