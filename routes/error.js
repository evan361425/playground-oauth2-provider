const { errors: { SessionNotFound } } = require('oidc-provider');

module.exports = (req, res) => {
  if (err instanceof SessionNotFound) {
    // handle interaction expired / session not found error
    return res.redirect('/');
  }

  res.status(404);

  // respond with html page
  if (req.accepts('html')) {
    res.render('404', {
      url: req.url,
      title: '404 found!',
      uid: 0,
      session: null,
      client: {},
      dbg: {},
      layout: 'bootstrap',
    });
    return;
  }

  // respond with json
  if (req.accepts('json')) {
    res.send({
      error: 'Not found',
    });
    return;
  }

  // default to plain-text. send()
  res.type('txt').send('Not found');
};
