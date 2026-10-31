'use strict';

const express = require('express');
const app = require('./backend/server');

if (require.main === module) {
  app.startServer().catch((err) => {
    console.error('[server] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = app;
