const { strict: assert } = require('assert');
const querystring = require('querystring');
const { inspect } = require('util');
const { isEmpty, set } = require('lodash');
const express = require('express');
const Account = require('../support/account');

const keys = new Set();
const debug = (obj) => querystring.stringify(
  Object.entries(obj).reduce((acc, [key, value]) => {
    keys.add(key);
    if (isEmpty(value)) return acc;

    set(acc, key, inspect(value, {
      depth: null,
    }));

    return acc;
  }, {}),
  '<br/>',
  ': ',
  { encodeURIComponent: (value) => keys.has(value) ? `<strong>${value}</strong>` : value },
);

module.exports = (provider) => {
  const body = express.urlencoded({ extended: false });
  // eslint-disable-next-line
  const router = express.Router();

  /**
   * Set header no-cache
   * @param {express.Request}      req
   * @param {express.Response}     res
   * @param {express.NextFunction} next
   */
  function setNoCache(req, res, next) {
    res.set('Pragma', 'no-cache');
    res.set('Cache-Control', 'no-cache, no-store');
    next();
  }

  router.get('/interaction/:uid', setNoCache, async (req, res, next) => {
    try {
      const {
        uid,
        prompt,
        params,
        session,
      } = await provider.interactionDetails(req, res);

      const client = await provider.Client.find(params.client_id);

      switch (prompt.name) {
      case 'select_account': {
        if (!session) {
          return provider.interactionFinished(req, res, {
            select_account: {},
          }, {
            mergeWithLastSubmission: false,
          });
        }

        const account = await provider.Account.findAccount(undefined, session.accountId);
        const {
          email,
        } = await account.claims('prompt', 'email', {
          email: null,
        }, []);

        return res.render('select_account', {
          client,
          uid,
          email,
          details: prompt.details,
          params,
          title: 'Sign-in',
          session: session ? debug(session) : undefined,
          dbg: {
            params: debug(params),
            prompt: debug(prompt),
          },
        });
      }
      case 'login': {
        return res.render('login', {
          client,
          uid,
          details: prompt.details,
          params,
          title: 'Sign-in',
          session: session ? debug(session) : undefined,
          dbg: {
            params: debug(params),
            prompt: debug(prompt),
          },
        });
      }
      case 'consent': {
        return res.render('interaction', {
          client,
          uid,
          details: prompt.details,
          params,
          title: 'Authorize',
          session: session ? debug(session) : undefined,
          dbg: {
            params: debug(params),
            prompt: debug(prompt),
          },
        });
      }
      default:
        return undefined;
      }
    } catch (err) {
      return next(err);
    }
  });

  router.post('/interaction/:uid/login', setNoCache, body, async (req, res, next) => {
    try {
      const {
        prompt: {
          name,
        },
      } = await provider.interactionDetails(req, res);
      assert.equal(name, 'login');
      const account = await Account.findByLogin(req.body.login);

      const result = {
        select_account: {}, // make sure its skipped by the interaction policy since we just logged in
        login: {
          account: account.accountId,
        },
      };

      await provider.interactionFinished(req, res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/interaction/:uid/continue', setNoCache, body, async (req, res, next) => {
    try {
      const interaction = await provider.interactionDetails(req, res);
      const {
        prompt: {
          name,
        },
      } = interaction;
      assert.equal(name, 'select_account');

      if (req.body.switch) {
        if (interaction.params.prompt) {
          const prompts = new Set(interaction.params.prompt.split(' '));
          prompts.add('login');
          interaction.params.prompt = [...prompts].join(' ');
        } else {
          interaction.params.prompt = 'login';
        }
        await interaction.save();
      }

      const result = {
        select_account: {},
      };
      await provider.interactionFinished(req, res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/interaction/:uid/confirm', setNoCache, body, async (req, res, next) => {
    try {
      const {
        prompt: {
          name,
        },
      } = await provider.interactionDetails(req, res);
      assert.equal(name, 'consent');

      const consent = {};

      // any scopes you do not wish to grant go in here
      //   otherwise details.scopes.new.concat(details.scopes.accepted) will be granted
      consent.rejectedScopes = [];

      // any claims you do not wish to grant go in here
      //   otherwise all claims mapped to granted scopes
      //   and details.claims.new.concat(details.claims.accepted) will be granted
      consent.rejectedClaims = [];

      // replace = false means previously rejected scopes and claims remain rejected
      // changing this to true will remove those rejections in favour of just what you rejected above
      consent.replace = false;

      const result = {
        consent,
      };
      await provider.interactionFinished(req, res, result, {
        mergeWithLastSubmission: true,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/interaction/:uid/abort', setNoCache, async (req, res, next) => {
    try {
      const result = {
        error: 'access_denied',
        error_description: 'End-User aborted interaction',
      };
      await provider.interactionFinished(req, res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/', (req, res) => {
    res.render('welcome', {
      layout: null,
    });
  });

  return router;
};
