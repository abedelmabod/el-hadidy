# All-courses account

The mobile app checks the Firebase Auth custom claim `allCoursesAccess: true`.
The account remains a student. No administrator or support role is added.
The app refreshes the Firebase token before checking the grant; a profile field
or saved session cannot grant access. Course years are discovered from current
lessons and subjects, so future course years do not require another grant.

Use a trusted Firebase Admin environment with permission to manage Firebase Auth
users and student profiles in Firestore. From the repository root, preview:

```sh
node functions/scripts/grant-all-courses.cjs --project el-hadidy-app --email aly.egy09@gmail.com
```

The default uses Application Default Credentials. Alternatively, supply
`--firebase-cli-path /absolute/path/to/firebase-tools` to use an authorized local
Firebase CLI login. Add `--apply` to perform the grant. For a new account also
provide `--setup-link-file /private/path/account-setup.txt`; the script writes a
password setup link with owner-only file permissions. It does not send email.
An existing account keeps its password and other custom claims. The script
rejects disabled accounts, banned students, staff profiles, and conflicting
student records. It verifies the custom claim after writing it.

After granting access, sign in normally and refresh the course list. To revoke
the grant, remove `allCoursesAccess` using the Admin SDK while preserving other
custom claims. The next online course/video access check refreshes the token.

Validation: `node --test tests/course-access.test.cjs`.

This change covers mobile course discovery and playback checks. It does not
replace deployed Firestore rules or add signed URLs to the existing Bunny video
delivery. Those server-side protections must be reviewed separately before
claiming that direct content URLs are protected by this permission.
