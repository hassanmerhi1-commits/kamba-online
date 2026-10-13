# Install Kamba Online on phones

## Why it was not installable before

Opening **http://localhost:8081** in Chrome is **only for testing on your PC** — it is not an app on the phone.

**Expo Go** (QR code) is also **not** your real app — it runs inside Expo’s app.

To get **Kamba Online** as its own icon on Android / iPhone you need a **native build** (APK / AAB / IPA).

---

## Fastest way — Android APK (install on any Android phone)

1. Create a free account: https://expo.dev/signup  
2. In PowerShell:

```powershell
cd "c:\Users\user\Desktop\APP ONLINE\mobile"
npm install -g eas-cli
eas login
eas init
```

(`eas init` links the project and fixes `projectId` in `app.json`.)

3. Build installable APK (cloud build, ~10–20 min):

```powershell
npm run build:android:apk
```

4. When finished, Expo gives a **download link**. Open it on the Android phone → install the APK.

---

## Google Play Store

- Same Expo account  
- Google Play Developer account (**one-time ~$25**)  
- Run: `npm run build:android:store`  
- Upload the **AAB** file in Play Console  
- Run: `eas submit --platform android` (after store listing is ready)

---

## Apple App Store / iPhone

- **Apple Developer Program** (**~$99/year**) — required for real iPhone install outside Expo Go  
- On a Mac or via EAS cloud:

```powershell
npm run build:ios
```

- Use **TestFlight** for testing, then **App Store** for public release  
- Submit: `eas submit --platform ios`

---

## Optional — “Add to home screen” from website (not Play Store)

After you host the web export on a real URL (not localhost), users can install a shortcut:

```powershell
npx expo export --platform web
```

Deploy the `dist` folder to hosting (Netlify, Vercel, etc.). On Android Chrome: **Menu → Install app**. On iPhone Safari: **Share → Add to Home Screen**.

This is **not** the same as Play Store / App Store, but works without store accounts.

---

## Checklist before store release

- [ ] Real **WhatsApp number** in `mobile/constants/config.ts`
- [ ] **Supabase** + real products/stock
- [ ] Your **logo/icon** (replace files in `mobile/assets/images/`)
- [ ] **Privacy policy** URL (stores often require it)
- [ ] `eas init` completed (real `projectId`)

---

## Summary

| Method | Installable? | What you need |
|--------|----------------|---------------|
| localhost / browser | No | PC test only |
| Expo Go | No | Dev test only |
| **EAS APK (preview)** | **Yes (Android)** | Expo account + `eas build` |
| Google Play | Yes | Developer account + AAB |
| App Store | Yes | Apple Developer + IPA |
