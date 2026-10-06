# On your phone

The diary runs on your computer. To use it from your phone, your phone has to be able to reach your computer, and that's what [Tailscale](https://tailscale.com) is for. It's a free app that puts your devices on a private network, so your phone can reach the diary from anywhere, while nobody else on the internet can.

Your diary stays on your computer the whole time. The phone is just a window into it, so your computer has to be on (and the diary running) to use it.

## 1. Keep the diary running

On Windows, run this once from the project folder:

```bash
bun run autostart
```

It starts the diary now and every time you log in, with no window. It's at http://localhost:3000. To stop it starting, `bun run autostart --off`.

Not on Windows? Run `bun run build`, then `bun run start`, and leave it running.

## 2. Set a passphrase

On your computer, open the diary, go to **Settings**, and under **Phone access** set a passphrase. Your phone signs in with it once and then stays signed in. Your computer never has to sign in.

## 3. Set up Tailscale

1. Install Tailscale on your computer and your phone from [tailscale.com/download](https://tailscale.com/download), and sign in on both with the same account.
2. In the [Tailscale admin console](https://login.tailscale.com/admin/dns), on the **DNS** page, turn on **MagicDNS** and **HTTPS Certificates**. Phones need HTTPS to install the app and get notifications.
3. On your computer, in a terminal:

   ```bash
   tailscale serve --bg 3000
   ```

   It prints an address like `https://your-pc.tail1234.ts.net`. `--bg` keeps it going after restarts. To stop sharing it, `tailscale serve reset`.

Use `serve`, not `funnel`. Funnel puts it on the public internet.

## 4. Open it on your phone

With Tailscale on, open that `https://...ts.net` address on your phone and sign in with the passphrase.

Then add it to your home screen, so it opens like an app:

- **iPhone:** in Safari, Share, then **Add to Home Screen**.
- **Android:** in Chrome, the menu, then **Add to Home screen** (or **Install app**).

## 5. Nightly reminder (optional)

In **Settings**, under **Reminder**, pick a time and save. Then on each device you want reminding, press **Remind me on this device**, and allow notifications. If nothing's been printed that day by then, you get a nudge.

- On iPhone, this only works from the home screen app, not a Safari tab.
- It works on your computer too, in Chrome or Edge.
- Your computer has to be on at that time, since that's what sends it.
- Notifications go through your browser's push service (Apple's or Google's). They only carry an encrypted "nothing printed yet", never anything from your diary.

## If something's not working

- **The page won't load on the phone:** check Tailscale is on, on both devices, and that the diary is running (open http://localhost:3000 on the computer).
- **"Phone access isn't set up yet":** set the passphrase on the computer (step 2).
- **Lost your phone:** on the computer, Settings, Phone access, **Sign out everywhere**. Or change the passphrase, which also signs everything out.
