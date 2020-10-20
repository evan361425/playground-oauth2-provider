/* eslint-disable no-console */
require('dotenv').config()

const path = require('path');
const url = require('url');

const set = require('lodash/set');
const express = require('express'); // eslint-disable-line import/no-unresolved
const helmet = require('helmet');

const { Provider } = require('oidc-provider');

const Account = require('./support/account');
const configuration = require('./support/configuration');

const { PORT = 80, ISSUER = `http://localhost:${PORT}` } = process.env;
configuration.findAccount = Account.findAccount;

const admin = require('firebase-admin')
admin.initializeApp({
  credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  databaseURL: process.env.GOOGLE_DATABASE_NAME
});
const adapter = require('./adapters/firestore'); // eslint-disable-line global-require

const app = express();
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
} else {
  app.use(helmet({
    contentSecurityPolicy: false
  }));
}

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

let server;
(async () => {
  const prod = process.env.NODE_ENV === 'production';

  if (prod) {
    set(configuration, 'cookies.short.secure', true);
    set(configuration, 'cookies.long.secure', true);
  }

  const provider = new Provider(ISSUER, { adapter, ...configuration });

  if (prod) {
    app.enable('trust proxy');
    provider.proxy = true;

    app.use((req, res, next) => {
      if (req.secure) {
        next();
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        res.redirect(url.format({
          protocol: 'https',
          host: req.get('host'),
          pathname: req.originalUrl,
        }));
      } else {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'do yourself a favor and only use https',
        });
      }
    });
  }

  require("./support/layout")(app)
  require('./routes')(app, provider)

  app.use('/', provider.callback);
  server = app.listen(PORT);
  console.log(`Server listening at http://localhost:${PORT}`)
})().catch((err) => {
  if (server && server.listening) server.close();
  console.error(err);
  process.exitCode = 1;
});
