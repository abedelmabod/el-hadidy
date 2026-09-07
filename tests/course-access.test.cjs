const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

function load(file, mocks, extra = '') {
  const code = babel.transformSync(fs.readFileSync(file, 'utf8') + extra, {
    configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  }, console });
  return exports;
}

test('all-courses permission requires fresh Firebase claims for the same user', async () => {
  const auth = { currentUser: { uid: 'owner' } };
  let claims = {};
  let requests = 0;
  const { hasAllCoursesAccess } = load('src/services/course-access-service.js', {
    '../firebase': { auth },
    'firebase/auth': { getIdTokenResult: async (user, refresh) => {
      assert.equal(user.uid, 'owner');
      assert.equal(refresh, true);
      requests++;
      return { claims };
    } },
  });
  assert.equal(await hasAllCoursesAccess({ uid: 'owner', allCoursesAccess: true, role: 'admin' }), false);
  claims = { allCoursesAccess: 'true' };
  assert.equal(await hasAllCoursesAccess({ uid: 'owner' }), false);
  claims = { allCoursesAccess: true };
  assert.equal(await hasAllCoursesAccess({ uid: 'owner' }), true);
  claims = {};
  assert.equal(await hasAllCoursesAccess({ uid: 'owner' }), false, 'revocation must be refreshed');
  assert.equal(await hasAllCoursesAccess({ uid: 'other' }), false);
  assert.equal(await hasAllCoursesAccess({ uid: 'owner', isBanned: true }), false);
  auth.currentUser = null;
  assert.equal(await hasAllCoursesAccess({ uid: 'owner' }), false);
  assert.equal(requests, 4);
});

test('token refresh failures do not grant access', async () => {
  const { hasAllCoursesAccess } = load('src/services/course-access-service.js', {
    '../firebase': { auth: { currentUser: { uid: 'owner' } } },
    'firebase/auth': { getIdTokenResult: async () => { throw new Error('network'); } },
  });
  await assert.rejects(hasAllCoursesAccess({ uid: 'owner' }), /network/);
});

test('video access honors the grant, bans, and ordinary registration codes', async () => {
  let granted = true;
  const codes = [{ code: '123', usedById: 'student', year: 'first', isUsed: true }];
  const { checkActiveVideoAccess } = load('src/utils/studentAccessGuard.js', {
    '../firebase': { db: {} },
    '../services/course-access-service': { hasAllCoursesAccess: async () => granted },
    'firebase/firestore': {
      collection: () => null, query: () => null, where: () => null,
      getDocs: async () => ({ docs: codes.map((data, i) => ({ id: String(i), data: () => data })) }),
    },
  });
  assert.equal((await checkActiveVideoAccess({ id: 'student', isSubscribed: false }, 'future')).allowed, true);
  assert.equal((await checkActiveVideoAccess({ id: 'student', isBanned: true })).allowed, false);
  granted = false;
  assert.equal((await checkActiveVideoAccess({ id: 'student' }, 'first')).allowed, true);
  assert.equal((await checkActiveVideoAccess({ id: 'student' }, 'future')).allowed, false);
  assert.equal((await checkActiveVideoAccess({ id: 'student', isSubscribed: false }, 'first')).allowed, false);
  codes[0].revoked = true;
  assert.equal((await checkActiveVideoAccess({ id: 'student' }, 'first')).allowed, false);
});

test('course discovery includes future years without another account grant', async () => {
  let granted = true;
  const documents = [{ year: 'first' }, { accessYears: ['first', 'New course year'] }];
  const { resolve } = load('src/hooks/useStudentData.js', {
    react: {}, 'react-native': {}, '@react-native-async-storage/async-storage': {},
    '../firebase': { db: {} },
    '../services/course-access-service': { hasAllCoursesAccess: async () => granted },
    'firebase/firestore': {
      collection: () => null, query: () => null, where: () => null,
      getDocs: async () => ({ docs: documents.map((data, i) => ({ id: String(i), data: () => data })) }),
    },
  }, '\nexports.resolve = resolveAuthorizedAccessYears;');
  assert.deepEqual(Array.from(await resolve({})), ['الفرقة الأولى', 'New course year']);
  documents.push({ year: 'Future year' });
  assert.ok((await resolve({})).includes('Future year'));
  assert.deepEqual(Array.from(await resolve({}, '', 'Future year')), ['Future year']);
  assert.equal((await resolve({ isBanned: true })).length, 0);
  granted = false;
  assert.equal((await resolve({})).length, 0);
});
