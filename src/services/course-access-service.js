import { getIdTokenResult } from 'firebase/auth';
import { auth } from '../firebase';

// Only Firebase Auth claims grant this permission; profile fields and cached
// navigation data must never grant access to additional courses.
export async function hasAllCoursesAccess(profile = {}) {
  const firebaseUser = auth.currentUser;
  const profileUid = profile.authUid || profile.uid || profile.id;
  if (!firebaseUser || firebaseUser.uid !== profileUid || profile.isBanned) return false;

  const token = await getIdTokenResult(firebaseUser, true);
  return token.claims.allCoursesAccess === true;
}
