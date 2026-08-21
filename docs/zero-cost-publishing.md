# Zero-cost publishing mode

My-SNS now defaults to a **zero-cost publishing strategy**.

The goal is practical personal use from one place without requiring paid posting APIs:

1. Create one Seed.
2. Generate/edit drafts for each target channel.
3. Approve the final Revision.
4. Add it to the publish Queue.
5. From the Queue, press **「Xへ投稿」「Instagramへ投稿」「YouTubeへ投稿」「TikTokへ投稿」「noteへ投稿」**.
6. My-SNS copies the approved text and opens the platform-owned composer/upload page.
7. Add the original image/video on the platform if needed, press the platform's final publish button, then return to My-SNS and press **「投稿済みにする」**.

## Why this is the default

`zero-cost` deliberately keeps the final publish action human-confirmed. It avoids external posting charges and avoids pretending that a media upload succeeded when a platform requires review, quota, account type, or an app audit.

X receives a stronger handoff: My-SNS uses X Web Intent, so the approved post text is pre-filled in X's own composer without an X API key. The same text is also copied to the clipboard.

For Instagram, YouTube, TikTok, note, Threads, Facebook, and LINE, My-SNS copies the prepared text and opens the platform-owned page. Media files stay under the creator's control and are selected there.

## Safety guarantee

When zero-cost mode is active:

- newly scheduled third-party jobs are stored as `publish_mode = manual`;
- the scheduled external publish Worker returns without calling a social connector;
- `/api/publish/trigger` refuses external connector execution;
- legacy `auto`/`assisted` jobs are shown as handoff actions in the Queue instead of API publish actions;
- after a real human-side publish, legacy jobs can be reconciled with 「投稿済みにする」.

This is intentionally defense-in-depth: changing only the button would not be enough, because an old auto job could otherwise still be picked up by the background Worker.

## Optional API-first mode

The repository's existing OAuth connector implementation is retained for later use. To opt back into it, build/deploy with:

```bash
NEXT_PUBLIC_PUBLISHING_STRATEGY=api-first
```

Any missing, empty, or unknown value falls back to `zero-cost`.

API-first should only be enabled after you intentionally accept each platform's current API requirements, quotas, reviews, and any applicable charges.

## Current media boundary

Zero-cost handoff currently automates **text preparation + copy + opening the correct platform UI**. It does not inject local image/video files into third-party web forms. Browsers and the platforms deliberately restrict that kind of cross-site file automation.

The next practical improvement is therefore not to bypass those protections, but to make the selected Seed assets easier to download/open beside each handoff so media attachment becomes one short manual step.
