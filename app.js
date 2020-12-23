/* eslint-disable no-console */
require('dotenv').config();
const path = require('path');
const express = require('express');
const { Provider } = require('oidc-provider');
const adapter = require('./adapters/firestore');
const configuration = require('./support/configuration');
const layoutMiddleware = require('./support/layout');
const routeIndex = require('./routes');
const errorHandler = require('./routes/error');

const { PORT = 80 } = process.env;
const { ISSUER = `http://localhost:${PORT}` } = process.env;

(async (app, provider) => {
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  app.use(layoutMiddleware);
  app.use('/', routeIndex(provider));
  app.use('/', provider.callback);
  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`Provider listening at ${ISSUER}`);
  });
})(express(), new Provider(ISSUER, { adapter, ...configuration }));
