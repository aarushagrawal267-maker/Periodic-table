# Social posting setup

Periodica's videos go out to Instagram (Reels) and YouTube (Shorts) on their own, three times a week, from scheduled Claude Code cloud sessions. For that to work, those sessions need permission to post as you. This guide walks you through granting it once. Plan on about 45 minutes.

You will end up with these values:

| Name | What it is | Needed for |
| --- | --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | A long text that lets the scripts post to your Instagram | Instagram |
| `INSTAGRAM_TOKEN_EXPIRES_AT` | The date that token stops working, like `2027-01-20` | Expiry warnings |
| `YOUTUBE_CLIENT_ID` | Your Google app's ID (ends in `.apps.googleusercontent.com`) | YouTube |
| `YOUTUBE_CLIENT_SECRET` | Your Google app's password | YouTube |
| `YOUTUBE_REFRESH_TOKEN` | A long-lasting pass to your YouTube channel (starts `1//`) | YouTube |

**Never paste any of these into a chat**, not even with Claude. They go only into the environment settings described in Part C. Anyone who has them can post as you.

---

## Part A: Instagram

### A1. Make your Instagram a Professional (Creator) account

Personal accounts cannot post through the API. Switching is free and you can switch back.

1. Open the Instagram app and go to your profile.
2. Tap the menu (three lines) and open **Settings and activity**.
3. Open **Account type and tools**, then tap **Switch to professional account**.
4. Choose **Creator** and pick a category such as *Education*. Skip the optional steps.

You do **not** need a Facebook Page.

### A2. Create a Meta developer app

1. Go to [developers.facebook.com](https://developers.facebook.com) and select **Get Started** (or **Log in**). Meta asks you to sign in with a Facebook account; that's only for the developer site.
2. Go to **My Apps** and select **Create app**.
3. Give it a name, such as *Periodica Poster*, and enter your email.
4. When asked for a use case, pick the Instagram one (*Manage messaging & content on Instagram*). If you're asked for an app type, pick **Business**. You can skip connecting a business portfolio.
5. Finish creating the app.

You don't need App Review or to make the app public. Posting to your own account works with the default access level.

### A3. Turn on the permissions

1. In the app dashboard, open the Instagram use case (**Use cases** → **Customize**, or **Instagram** in the left menu), then **API setup with Instagram business login**.
2. Under the permissions list, make sure these four are added:
   - `instagram_business_basic`
   - `instagram_business_content_publish` (posting)
   - `instagram_business_manage_comments` (reading and replying to comments)
   - `instagram_business_manage_insights` (views, reach, saves)

### A4. Add your Instagram account as a tester (only if needed)

Skip this unless your account doesn't appear in A5 or the login fails there.

1. In the dashboard, open **App roles** → **Roles** → **Add People** → **Instagram Tester**, then enter your Instagram username.
2. On Instagram (on the web: **Settings** → **Apps and websites** → **Tester invites**), accept the invite.

### A5. Generate the token

1. On the same **API setup with Instagram business login** page, find **Generate access tokens**.
2. Select **Add account** (or **Generate token**) next to your Instagram account and log in to Instagram when asked. Allow every permission it lists.
3. Copy the token it shows. It's long and usually starts with `IG`.
4. Work out the expiry date: **today plus 60 days**. That's your `INSTAGRAM_TOKEN_EXPIRES_AT`, written like `2027-01-20`.

Tokens from this page are long-lived: they last 60 days.

### A6. Renewing the Instagram token (every ~50 days)

Posting runs warn you when the token has 10 days or fewer left. To renew:

1. Repeat **A5** to get a fresh token.
2. Replace `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_TOKEN_EXPIRES_AT` in the environment settings (Part C).

If a token lapses, nothing breaks except Instagram posting; YouTube carries on. Make a new token and posting resumes on the next run.

### Instagram upload mode (read this if Instagram posting fails)

By default the scripts send the video file straight to Meta, so you don't need to host it anywhere. Meta's docs currently describe that direct upload only for apps using *Facebook* Login, not the Instagram Login set up here. If the first real post fails with a message saying the upload was rejected and mentioning `INSTAGRAM_MEDIA_BASE_URL`, the fallback is to put the videos at a public web address and set `INSTAGRAM_MEDIA_BASE_URL` to the folder's URL. Ask Claude to set this up with you.

A public web address is also the only way Instagram accepts our custom cover image. Without one, Instagram uses the first frame of the video as the cover. YouTube always gets the custom cover.

---

## Part B: YouTube

### B1. Create the Google app (Personal mode, recommended)

Sign in to Google with **the account that owns the YouTube channel** first.

1. Open [console.cloud.google.com/auth/overview/personal](https://console.cloud.google.com/auth/overview/personal). This is Google's *Personal mode* setup for apps only you will use.
2. Let it create a new project (the default name is fine).
3. For the application type, choose **Web application**.
4. Under **Authorized redirect URIs**, add exactly: `https://developers.google.com/oauthplayground`
5. Accept the terms and select **Continue**.
6. Copy the **Client ID** and **Client secret** now. **Google shows the secret only once.** Save them somewhere safe, such as a password manager, or download the JSON file.

**Why Personal mode:** Google says Personal-mode apps don't need verification, skip the "unverified app" warning, and are not subject to the 7-day token expiry. That expiry would otherwise stop YouTube posting every week.

If that page isn't available to you, use **B1-alt** below instead.

### B2. Turn on the YouTube APIs

1. In the same project, open **APIs & Services** → **Library**.
2. Search **YouTube Data API v3** and select **Enable**.
3. Search **YouTube Analytics API** and select **Enable**. This one is optional; it adds shares and watch time to the weekly numbers.

### B3. Get the refresh token with the OAuth 2.0 Playground

1. Open [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
2. Select the **gear icon** (top right). Tick **Use your own OAuth credentials** and paste your Client ID and Client secret. Leave **Access type** on **Offline**. Close the panel.
3. On the left, in **Input your own scopes**, paste this whole line:

   ```
   https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly
   ```

   These scopes let the scripts upload, set covers, read and reply to comments, and read view counts and analytics.
4. Select **Authorize APIs**. Sign in with the channel's Google account. If Google asks which channel or brand account to use, pick the Periodica channel. Allow everything.
5. Back in the Playground, select **Exchange authorization code for tokens**.
6. Copy the **Refresh token** (it starts with `1//`). That's your `YOUTUBE_REFRESH_TOKEN`. Ignore the access token; it expires in an hour.

The refresh token keeps working until you revoke it, or until it goes unused for six months (the posting schedule prevents that).

### B4. Unlock custom covers

YouTube allows custom thumbnails only on verified channels. Go to [youtube.com/verify](https://www.youtube.com/verify) and verify by phone. If you skip this, videos still post, just with an automatic thumbnail.

### B5. Do YouTube uploads come out private? (the "audit" question)

Since 2020, YouTube locked videos uploaded through unverified Google apps to **private**, and unlocking them needed an audit. **YouTube removed that rule on 2 November 2026**, so new uploads can go public straight away.

If a test upload still shows as **Private** in YouTube Studio:

1. Check **YouTube Studio** → **Settings** → **Upload defaults**, and set the visibility you want.
2. Meanwhile, we upload as usual and you switch each video to **Public** in YouTube Studio. That's one click per video; the posting report flags this case.
3. If it keeps happening, fill in the [YouTube API Services audit and quota extension form](https://support.google.com/youtube/contact/yt_api_form). Describe the use as "posting our own educational Shorts to our own channel, three a week".

The free daily allowance covers far more than three uploads a week, so you don't need the audit for quota.

### B1-alt. If Personal mode isn't offered

1. In [console.cloud.google.com](https://console.cloud.google.com), create a project, then open **Google Auth Platform** (or **APIs & Services** → **OAuth consent screen**).
2. **Branding:** enter an app name and your email.
3. **Audience:** choose **External**, and add your own Gmail as a **test user**.
4. **Clients:** select **Create client** → **Web application**, and add the redirect URI `https://developers.google.com/oauthplayground`. Copy the ID and secret.
5. Back on **Audience**, select **Publish app** so the status reads **In production**.

**Why "In production":** in *Testing*, Google expires refresh tokens after **7 days**, and YouTube posting would stop every week. In production, the token lasts. Because the app isn't verified, Google shows a **"Google hasn't verified this app"** screen when you authorize it in B3. Select **Advanced** → **Go to … (unsafe)**. That's expected for an app only you use.

Then continue with B2 and B3.

### Audience setting ("made for kids")

YouTube makes every channel declare whether videos are *made for kids*. The scripts declare **No** by default, because Periodica is aimed at students in Class 9 and up. Videos marked *made for kids* lose comments and some features. If you decide the videos are for young children, add `YOUTUBE_MADE_FOR_KIDS=true` to the environment variables. This is your call to make.

---

## Part C: Put the values where the posting sessions can use them

1. Open [claude.ai/code](https://claude.ai/code). In a session's title bar, open the **cloud environment** menu and select **Edit** on the environment the scheduled posting task uses.
2. In **Environment variables**, add one line per value, in exactly this form. Replace each value with your own, and use no quotes or spaces around `=`:

   ```
   INSTAGRAM_ACCESS_TOKEN=IG...your token...
   INSTAGRAM_TOKEN_EXPIRES_AT=2027-01-20
   YOUTUBE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=GOCSPX-...
   YOUTUBE_REFRESH_TOKEN=1//0g...
   ```

   Anyone who can use this environment can read these values, so keep it your own environment and don't share it.
3. Under **Network access**, either choose **Full**, or keep **Limited** and add these to **Allowed domains** (one per line):

   ```
   graph.instagram.com
   rupload.facebook.com
   graph.facebook.com
   ```

   Google's addresses (`*.googleapis.com`) are already allowed under Limited.
4. Select **Save changes**. New sessions pick the values up.

**Optional, more private (Instagram only):** instead of the `INSTAGRAM_ACCESS_TOKEN=IG...` line, store the token as a **Network secret**. The scripts then never see it.

1. In the same dialog, open **Network secrets** → **Add secret**.
2. Set **Allowed websites** to `graph.instagram.com` and `rupload.facebook.com`, keep the header `Authorization` with prefix `Bearer`, and paste the token as the value.
3. In Environment variables, write `INSTAGRAM_ACCESS_TOKEN=network-secret`.

To renew the token, delete the secret and add it again. YouTube's values can't be network secrets, because they travel inside the request body rather than a header.

### Check it works

Start a new session in that environment and ask Claude to run:

```
node social/publish/instagram.mjs --check-token
node social/publish/youtube.mjs --check-auth
node social/publish/post.mjs --id <any calendar id> --dry-run
```

The first two print your Instagram username and YouTube channel name. The third shows exactly what would be sent, without posting anything.

---

## When something goes wrong

Each posting run prints one line per platform. A failure comes with a short reason and what to do. The most common ones:

| Message mentions | What to do |
| --- | --- |
| Instagram token rejected / expired | Make a new token (A5) and update Part C |
| YouTube refresh token rejected | Make a new refresh token (B3). If it keeps happening weekly, your Google app is in *Testing*: see B1-alt step 5 |
| permission / scope missing | Redo A3 + A5 (Instagram) or B3 (YouTube) and allow everything |
| publishing limit / quota | Nothing to do; the next scheduled run retries |
| "may have gone live" | Check the account. If the post is up, tell Claude so it can mark it posted; if not, ask Claude to post again with `--force` |

One platform failing never stops the other, and nothing is ever posted twice. Each post is logged in `social/posted.json`.
