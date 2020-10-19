const store = new Map();
const logins = new Map();
const { nanoid } = require('nanoid');

class Account {
  constructor(id, profile) {
    this.accountId = id || nanoid();
    this.profile = profile;
    store.set(this.accountId, this);
  }

  /**
   * @param use - can either be "id_token" or "userinfo", depending on
   *   where the specific claims are intended to be put in.
   * @param scope - the intended scope, while oidc-provider will mask
   *   claims depending on the scope automatically you might want to skip
   *   loading some claims from external resources etc. based on this detail
   *   or not return them in id tokens but only userinfo and so on.
   */
  async claims(use, scope) { // eslint-disable-line no-unused-vars
    if (this.profile) {
      return {
        sub: this.accountId, // it is essential to always return a sub claim
        email: this.profile.email,
        email_verified: this.profile.email_verified,
        family_name: this.profile.family_name,
        given_name: this.profile.given_name,
        name: this.profile.name,
      };
    } else {
      return {
        sub: this.accountId,
        email: 'none@email.com',
        email_verified: false,
        family_name: 'fn',
        given_name: 'gv',
        name: 'name'
      }
    }
  }

  static async findByFederated(provider, claims) {
    const id = `${provider}.${claims.sub}`;
    if (!logins.get(id)) {
      logins.set(id, new Account(id, claims));
    }
    return logins.get(id);
  }

  static async findByLogin(login) {
    if (!logins.get(login)) {
      logins.set(login, new Account(login));
    }

    return logins.get(login);
  }

  static async findAccount(ctx, id, token) { // eslint-disable-line no-unused-vars
    // token is a reference to the token used for which a given account is being loaded,
    //   it is undefined in scenarios where account claims are returned from authorization endpoint
    // ctx is the koa request context
    // if (!store.get(id)) new Account(id); // eslint-disable-line no-new
    return store.get(id);
  }
}

new Account('test1', {
  address: 'address1',
  birthdate: '1987-10-16',
  email: 'test1@email.com',
  email_verified: true,
  family_name: 'Robot',
  given_name: 'Name1',
  name: 'Abc',
  phone_number: '88888888888'
})

new Account('test2', {
  address: 'address2',
  birthdate: '1995-01-23',
  email: 'test2@email.com',
  email_verified: false,
  family_name: 'Robot',
  given_name: 'Name2',
  name: 'Def',
  phone_number: '99999999999'
})

module.exports = Account;
