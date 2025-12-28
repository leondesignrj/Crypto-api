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

async function getHistorical(symbol = "BTCUSDT", interval = "1m", limit = 100) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await axios.get(url, { timeout: 5000 });
    return res.data.map(k => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (err) {
    console.error("Error fetching historical data:", err.message);
    throw err;
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

async function predictTrend(symbol = "BTCUSDT") {
  try {
    const historical = await getHistorical(symbol, "1m", 100);
    const closes = historical.map(c => c.close);

    const shortEMA = ema(closes, SHORT_EMA).pop();
    const longEMA = ema(closes, LONG_EMA).pop();
    const lastRSI =
