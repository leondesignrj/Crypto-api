const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'API crypto funcionando' });
});

app.listen(3000, () => {
  console.log('Servidor activo en puerto 3000');
});
