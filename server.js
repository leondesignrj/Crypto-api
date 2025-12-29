// server.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===================
// RUTA BASE
// ===================
app.get("/", (req, res) => {
  res.send("API crypto funcionando");
});

// ===================
// FUNCIONES AUXILIARES
// ===================
async function getHistorical(symbol = "BTCUSDT", interval = "1d", limit = 1000) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await axios.get(url, { timeout: 10000 });

    return response.data.map(k => ({
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

function ema(data, period) {
  const k = 2 / (period + 1);
  let emaArray = [data[0]];

  for (let i = 1; i < data.length; i++) {
    emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
  }
  return emaArray;
}

function rsi(data, period) {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let rs = gains / (losses || 1);
  let rsiArr = [100 - 100 / (1 + rs)];

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains = (gains * (period - 1) + diff) / period;
    else losses = (losses * (period - 1) - diff) / period;

    rs = gains / (losses || 1);
    rsiArr.push(100 - 100 / (1 + rs));
  }

  return rsiArr;
}

// ===================
// PARÁMETROS
// ===================
const SHORT_EMA = 10;
const LONG_EMA = 50;
const RSI_PERIOD = 14;

// ===================
// ALGORITMO PRINCIPAL
// ===================
async function predictTrend(symbol) {
  const historical = await getHistorical(symbol);
  if (!historical) return { symbol, error: "no_data" };

  const closes = historical.map(c => c.close);
  if (closes.length < LONG_EMA) {
    return { symbol, error: "not_enough_data" };
  }

  const shortEMA = ema(closes, SHORT_EMA).pop();
  const longEMA = ema(closes, LONG_EMA).pop();
  const lastRSI = rsi(closes, RSI_PERIOD).pop();

  let trend = "neutral";
  if (shortEMA > longEMA && lastRSI < 70) trend = "bullish";
  else if (shortEMA < longEMA && lastRSI > 30) trend = "bearish";

  let confidence = Math.abs(shortEMA - longEMA) / longEMA * 100;
  confidence = Math.min(Math.max(confidence * 10, 5), 85);

  const continuation = confidence;
  const reversal = 100 - continuation;

  const volatility =
    closes.slice(-30).reduce((acc, val, i, arr) => {
      if (i === 0) return acc;
      return acc + Math.abs(val - arr[i - 1]) / arr[i - 1];
    }, 0) / 30;

  let risk = "low";
  if (volatility > 0.05 || lastRSI > 70 || lastRSI < 30) risk = "high";
  else if (volatility > 0.025) risk = "medium";

  let signal = "NO_OPERAR";
  if (trend === "bullish" && confidence > 70) signal = "HOLD";
  else if (trend === "bullish" && confidence > 60 && risk !== "high") signal = "SWING";
  else if (trend !== "neutral" && confidence > 45) signal = "SCALP";

  const horizons = {
    "7d": Math.min(confidence + 5, 90),
    "30d": confidence,
    "90d": Math.max(confidence - 10, 10)
  };

  return {
    symbol,
    trend,
    confidence: Number(confidence.toFixed(2)),
    continuation: Number(continuation.toFixed(2)),
    reversal: Number(reversal.toFixed(2)),
    risk,
    signal,
    horizons,
    rsi: Number(lastRSI.toFixed(2))
  };
}

// ===================
// ENDPOINTS
// ===================
app.get("/predict", async (req, res) => {
  const symbol = req.query.symbol || "BTCUSDT";
  const result = await predictTrend(symbol);
  res.json(result);
});

// ===================
// SERVIDOR
// ===================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
