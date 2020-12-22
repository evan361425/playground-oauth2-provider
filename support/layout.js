module.exports = (req, res, next) => {
  const orig = res.render;
  // add layout to response
  res.render = (view, locals) => {
    if (locals.layout === null) return orig.call(res, view, locals);

    orig.call(res, view, locals, (err, html) => {
      if (err) return next(err);

      orig.call(res, '_layout', {
        ...locals,
        body: html,
      });
    });
  };
  next();
};
