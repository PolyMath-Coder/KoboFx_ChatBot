const express = require('express');
require('dotenv').config();
const { PORT } = require('./config/keys');
const logger = require('./config/logger');
const app = express();

app.get('/', (req, res) => {
  res.status(200).json({ status: true });
});

app.listen(PORT, () => {
  logger.info(`Server is now live at port ${PORT}`);
});
