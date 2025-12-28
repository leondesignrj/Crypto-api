const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'API crypto funcionando' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
