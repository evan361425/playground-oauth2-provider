/*eslint-disable */
/*
 * Setup firebase-admin for use in nodejs
 * 1- Add the firebase-admin npm package.
 * 2- Go to https://console.firebase.google.com/ and create a project if you do not have an existing one.
 * 3- Get the secret from https://console.firebase.google.com/u/0/project/{PROJECT_ID}/settings/serviceaccounts/adminsdk.
 * 4- Set GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of the JSON file.
 * 5- import the library using `import * as admin from 'firebase-admin'` in the server file.
 * 6- Call `admin.initializeApp()` in the server file to establish the connection.
 *
 * Reach out to @hadyrashwan <https://github.com/hadyrashwan> for questions on this community example.
 */
/* eslint-enable */
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  databaseURL: process.env.GOOGLE_DATABASE_NAME,
});

// A work around as firestore does not support undefined.
const undefinedFirestoreValue = 'custom.type.firestore';
const namePrefix = 'OIDC_';

const db = admin.firestore();

/**
 * Use the library with Google's Firestore database
 *
 * @class FirestoreAdapter
 */
class FirestoreAdapter {
  /**
   * constructor
   * @param {string} name
   */
  constructor(name) {
    this.name = `${namePrefix}${name.split(' ').join('_')}`;
  }

  /**
   * Insert id token
   * @param  {string}  id
   * @param  {object}  payload
   * @param  {number}  expiresIn
   * @return {Promise}
   */
  async upsert(id, payload, expiresIn) {
    let expiresAt;

    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000);
    }
    await db
      .collection(this.name)
      .doc(id)
      .set(
        {
          payload: this.updateNestedObject(
            payload,
            undefined,
            undefinedFirestoreValue,
          ),
          ...(expiresAt ? {
            expiresAt,
          } : null),
        },
        {
          merge: true,
        },
      );
  }

  /**
   * get data by id
   * @param  {string}  id
   * @return {Promise}
   */
  async find(id) {
    const response = await db.collection(this.name).doc(id).get();
    if (!response.exists) {
      return undefined;
    }
    const data = response.data();
    if (data.consumed) {
      return undefined;
    }
    return this.updateNestedObject(
      data.payload,
      undefinedFirestoreValue,
      undefined,
    );
  }

  /**
   * Find by authenticate code
   * @param  {string}  userCode
   * @return {Promise}
   */
  async findByUserCode(userCode) {
    const response = await db
      .collection(this.name)
      .where('payload.userCode', '==', userCode)
      .limit(1)
      .get();
    if (response.empty) {
      return undefined;
    }
    const data = response[0].data();
    if (data.consumed) {
      return undefined;
    }
    return this.updateNestedObject(
      data.payload,
      undefinedFirestoreValue,
      undefined,
    );
  }

  /**
   * Find token by id
   * @param  {string}  uid [description]
   * @return {Promise}     [description]
   */
  async findByUid(uid) {
    const response = await db.collection(this.name)
      .where('payload.uid', '==', uid)
      .limit(1)
      .get();
    if (response.empty) {
      return undefined;
    }
    const data = response.docs[0].data();
    if (data.consumed) {
      return undefined;
    }
    return this.updateNestedObject(
      data.payload,
      undefinedFirestoreValue,
      undefined,
    );
  }

  /**
   * Remove specific collection
   * @param  {string}  id
   * @return {Promise}
   */
  async destroy(id) {
    await db.collection(this.name).doc(id).delete();
  }

  /**
   * Revoke token by grantId
   * @param  {string}  grantId [description]
   * @return {Promise}         [description]
   */
  async revokeByGrantId(grantId) {
    const response = await db.collection(this.name)
      .where('payload.grantId', '==', grantId)
      .get();
    if (response.empty) {
      return;
    }
    const batch = db.batch();

    response.docs.forEach((doc) => batch.delete(
      db.collection(this.name).doc(doc.id).delete()),
    );

    await batch.commit();
  }

  /**
   * Update by id
   * @param  {string}  id
   * @return {Promise}
   */
  async consume(id) {
    const response = await db.collection(this.name).doc(id).get();
    if (!response.exists) {
      return;
    }
    const data = response.data();
    data.consumed = Math.floor(Date.now() / 1000);
    await db.collection(this.name).doc(id).update(data);
  }

  /**
   * Replace a value in the object with another value
   *
   * @private
   * @param {object} object
   * @param {(string | undefined)} value
   * @param {(string | undefined)} toReplaceValue
   * @return {FirestoreAdapter}
   */
  updateNestedObject(object, value, toReplaceValue) {
    const internalObject = Array.isArray(object) ? object : {
      ...object,
    }; // avoid mutation
    const keys = Object.keys(internalObject);
    for (let index = 0; index < keys.length;) {
      const key = keys[`${index}`];
      if (Object.prototype.hasOwnProperty.call(internalObject, key)) {
        if (internalObject[`${key}`] === value) {
          internalObject[`${key}`] = toReplaceValue;
        }
        if (typeof internalObject[`${key}`] === 'object') {
          // Recursion
          internalObject[`${key}`] = this.updateNestedObject(
            internalObject[`${key}`],
            value,
            toReplaceValue,
          );
        }
      }
      index += 1;
    }
    return internalObject;
  }
}

async function deleteCollection(collectionPath, batchSize = 50) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve)
      .catch((err) => console.log(err.message));
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}


// clean storage if start up server
if (process.env.NODE_ENV === 'development') {
  deleteCollection(`${namePrefix}Session`);
  deleteCollection(`${namePrefix}AuthorizationCode`);
  deleteCollection(`${namePrefix}AccessToken`);
}

module.exports = FirestoreAdapter;
