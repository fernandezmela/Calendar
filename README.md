# Six Hours Apart

A shared calendar for two people in two time zones. It's a static site on GitHub Pages, with plans stored in Firebase Firestore behind Google sign-in. The repo contains no emails, names or plans.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure: clocks, calendar, add/edit form, sign-in screen |
| `style.css` | All styling, including light and dark themes |
| `app.js` | Time zone math, rendering, the form, and the Firebase connection |
| `config.js` | **You edit this.** Firebase keys and the two cities |
| `firestore.rules` | A template for the database rules. You paste it into the Firebase console and add the real emails **there**, not in this file |

## Setup (all in the browser)

### 1. Firebase console

1. **Web app:** in Project settings, under *Your apps*, click `</>` and register the app. Copy the `firebaseConfig` values into `config.js`. Skip the npm command and the Hosting option.
2. **Google sign-in:** go to *Build → Authentication → Get started → Sign-in method → Google → Enable*, then save.
3. **Allow the GitHub site:** go to *Authentication → Settings → Authorized domains → Add domain* and add `fernandezmela.github.io`.
4. **Database:** go to *Build → Firestore Database → Create database*, choose **production mode**, and create it.
5. **Rules:** on the Firestore **Rules** tab, paste in `firestore.rules`, put both real emails in (all lowercase, in the console only), and click **Publish**.

### 2. GitHub

1. In the repo, use *Add file → Upload files* to upload all the files, then commit.
2. Go to *Settings → Pages*. Set the source to **Deploy from a branch**, the branch to `main`, and the folder to `/ (root)`, then save.
3. After a minute or two the site is live at `https://fernandezmela.github.io/Calendar/`.

The repo must stay public: GitHub Pages on a free account doesn't serve private repos.

### 3. Use it

Open the link and sign in with Google, then pick your side. Each person picks once per device. Use **Edit names** to set your names; they're saved in the database. Anyone whose email isn't in the rules sees "Not on the list."

## Updating

Edit a file on GitHub (pencil icon), commit, and the site updates within a minute or two.

## Notes

- **Privacy:** the Firebase keys in `config.js` only identify the project and are safe to publish. The rules in the Firebase console are what keep your plans private.
- **Cost:** the free Firebase plan covers far more than two people will use.
- **Changing cities:** edit `city` and `timeZone` in `config.js`. Daylight saving is calculated from the time zone name.
