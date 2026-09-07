// Run from a trusted machine with Firebase Admin credentials. Never bundle this
// script with the app. Existing passwords and unrelated claims are preserved.
const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  const email = args.includes('--email') ? option('--email').trim().toLowerCase() : '';
  const projectId = args.includes('--project') ? option('--project') : '';
  if (!email.includes('@') || !projectId) throw new Error('Provide --email and --project. Add --apply to grant access.');

  let credential = admin.credential.applicationDefault();
  let firestore;
  if (args.includes('--firebase-cli-path')) {
    const cliAuth = require(path.join(option('--firebase-cli-path'), 'lib/auth.js'));
    const account = cliAuth.getProjectDefaultAccount(process.cwd());
    if (!account) throw new Error('Log in with the Firebase CLI first.');
    const { Firestore } = require('@google-cloud/firestore');
    const cliApi = require(path.join(option('--firebase-cli-path'), 'lib/api.js'));
    firestore = new Firestore({ projectId, credentials: {
      type: 'authorized_user', client_id: cliApi.clientId(), client_secret: cliApi.clientSecret(), refresh_token: account.tokens.refresh_token,
    } });
    credential = { getAccessToken: async () => {
      const token = await cliAuth.getAccessToken(account.tokens.refresh_token, []);
      return { access_token: token.access_token, expires_in: token.expires_in || 3600 };
    } };
  }

  admin.initializeApp({ credential, projectId });
  const auth = admin.auth();
  const db = firestore || admin.firestore();
  let account = await auth.getUserByEmail(email).catch((error) => {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  });
  if (account?.disabled) throw new Error('The existing account is disabled; no changes made.');

  for (const name of ['admins', 'support_team']) {
    const byEmail = await db.collection(name).where('email', '==', email).get();
    const byUid = account ? await db.collection(name).where('authUid', '==', account.uid).get() : null;
    const direct = account ? await db.collection(name).doc(account.uid).get() : null;
    if (!byEmail.empty || (byUid && !byUid.empty) || direct?.exists) {
      throw new Error('This email has a staff profile; use a separate student account.');
    }
  }

  const matches = await db.collection('students').where('email', '==', email).get();
  const uidMatches = account ? await db.collection('students').where('authUid', '==', account.uid).get() : null;
  const direct = account ? await db.collection('students').doc(account.uid).get() : null;
  const profiles = new Map([...matches.docs, ...(uidMatches?.docs || []), ...(direct?.exists ? [direct] : [])].map((doc) => [doc.id, doc]));
  if (profiles.size > 1) throw new Error('Multiple student profiles found; resolve them before granting access.');
  const profile = [...profiles.values()][0];
  if (profile?.data().isBanned) throw new Error('The student is banned; no changes made.');
  if (profile?.data().authUid && profile.data().authUid !== account?.uid) throw new Error('Profile belongs to a different Auth user.');
  const isNew = !account;
  console.log(JSON.stringify({ email, existingAuthAccount: !!account, existingStudentProfile: !!profile, allCoursesAccess: account?.customClaims?.allCoursesAccess === true, apply: args.includes('--apply') }));
  if (!args.includes('--apply')) return;
  if (isNew && !args.includes('--setup-link-file')) throw new Error('Provide --setup-link-file for a new account.');
  if (args.includes('--setup-link-file') && fs.existsSync(path.resolve(option('--setup-link-file')))) {
    throw new Error('Setup-link file already exists; choose a new private path.');
  }

  if (!account) account = await auth.createUser({ email, password: crypto.randomBytes(32).toString('base64url'), displayName: email.split('@')[0] });
  const profileRef = profile?.ref || db.collection('students').doc(account.uid);
  if (!profile) {
    await profileRef.set({
      authUid: account.uid, email, username: email, name: account.displayName || email.split('@')[0],
      isBanned: false, isSubscribed: true, maxDevices: 1, deviceIds: [], deviceCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await profileRef.update({ authUid: account.uid });
  }
  await auth.setCustomUserClaims(account.uid, { ...(account.customClaims || {}), allCoursesAccess: true });
  const verified = await auth.getUser(account.uid);
  if (verified.customClaims?.allCoursesAccess !== true) throw new Error('Grant verification failed.');
  if (args.includes('--setup-link-file')) {
    const link = await auth.generatePasswordResetLink(email);
    const destination = path.resolve(option('--setup-link-file'));
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.writeFileSync(destination, `Account: ${email}\nSet your password using this private link:\n${link}\n`, { mode: 0o600, flag: 'wx' });
    console.log(`Password setup link saved to ${destination}`);
  }
  console.log(`Verified all-courses access for ${email}; student profile ${profileRef.id}.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
