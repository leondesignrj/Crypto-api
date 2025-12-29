// server.js
const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

// --- CACHE ---
const CACHE_FILE = "./cache.json";
let historicalCache = {};

// Cargar cache si existe
if (fs.existsSync(CACHE_FILE)) {
  try {
    historicalCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    console.log("Cache cargada desde archivo.");
  } catch (err) {
    console.error("Error al cargar cache:", err.message);
    historicalCache = {};
  }
}

// Guardar cache cada 10 minutos
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(historicalCache), "utf8");
}
setInterval(saveCache, 10 * 60 * 1000);

// --- RUTA BASE ---
app.get("/", (req, res) => {
  res.send("API crypto funcionando con análisis diario completo y cache");
});

// --- FUNCIONES DEL ALGORITMO ---
async function getAllHistorical(symbol) {
  const interval = "1d";
  const limit = 1000;
  let startTime = 0;
  let allData = [];

  try {
    while (true) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&startTime=${startTime}`;
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;
      if (!data || data.length === 0) break;

      allData = allData.concat(data);
      startTime = data[data.length - 1][0] + 1; // timestamp siguiente
    }

    return allData.map(k => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err.message);
    return null;
  }
}

// Función que utiliza cache
async function getHistoricalCached(symbol) {
  if (historicalCache[symbol]) return historicalCache[symbol];

  const historical = await getAllHistorical(symbol);
  if (historical) historicalCache[symbol] = historical;
  return historical;
}

// EMA
function ema(data, period) {
  const k = 2 / (period + 1);
  const emaArray = [data[0]];
  for (let i = 1; i < data.length; i++) {
    emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
  }
  return emaArray;
}

// RSI
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

// Parámetros
const SHORT_EMA = 10;
const LONG_EMA = 50;
const RSI_PERIOD = 14;

// Predecir tendencia con porcentaje
async function predictTrend(symbol) {
  const historical = await getHistoricalCached(symbol);
  if (!historical || historical.length < LONG_EMA) return { symbol, trend: "error", probability: 0 };

  const closes = historical.map(c => c.close);
  const shortEMA = ema(closes, SHORT_EMA).pop();
  const longEMA = ema(closes, LONG_EMA).pop();
  const lastRSI = rsi(closes, RSI_PERIOD).pop();

  let trend = "neutral";
  if (shortEMA > longEMA && lastRSI < 70) trend = "bullish";
  else if (shortEMA < longEMA && lastRSI > 30) trend = "bearish";

  // Porcentaje de predicción
  const emaDiff = Math.abs(shortEMA - longEMA) / longEMA;
  const rsiScore = (50 - Math.abs(lastRSI - 50)) / 50;
  const probability = Math.min(Math.max(emaDiff * 100 + rsiScore * 50, 0), 100);

  return { symbol, trend, probability: parseFloat(probability.toFixed(2)), shortEMA, longEMA, lastRSI };
}

// --- ENDPOINTS ---
app.get("/predict/stable", async (req, res) => {
  const symbols = ["BTCUSDT", "ETHUSDT"];
  const results = [];
  for (const symbol of symbols) {
    results.push(await predictTrend(symbol));
  }
  res.json({ category: "stable", data: results });
});

app.get("/predict/alt", async (req, res) => {
  const symbols = ["PAXGUSDT", "BNBUSDT", "XRPUSDT","SOLUSDT"]; // reemplazar por altcoins activas
  const results = [];
  for (const symbol of symbols) {
    results.push(await predictTrend(symbol));
  }
  res.json({ category: "alt", data: results });
});

// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
