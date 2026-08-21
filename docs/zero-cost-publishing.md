# Zero-cost publishing mode

My-SNS now defaults to a **zero-cost publishing strategy**.

The goal is practical personal use from one place without requiring paid posting APIs:

1. Create one Seed.
2. Attach the image/video/audio/document assets that belong to it. Assets can also be added later from the Seed media manager.
3. Generate/edit drafts for each target channel.
4. Approve the final Revision.
5. Add it to the publish Queue.
6. In the Queue, preview/open/download the Seed assets beside the post.
7. Press **「Xへ投稿」「Instagramへ投稿」「YouTubeへ投稿」「TikTokへ投稿」「noteへ投稿」**.
8. My-SNS copies the approved text and opens the platform-owned composer/upload page.
9. Select the prepared media file on the platform if needed, press the platform's final publish button, then return to My-SNS and press **「投稿済みにする」**.

## Why this is the default

`zero-cost` deliberately keeps the final publish action human-confirmed. It avoids external posting charges and avoids pretending that a media upload succeeded when a platform requires review, quota, account type, or an app audit.

X receives a stronger handoff: My-SNS uses X Web Intent, so the approved post text is pre-filled in X's own composer without an X API key. The same text is also copied to the clipboard.

For Instagram, YouTube, TikTok, note, Threads, Facebook, and LINE, My-SNS copies the prepared text and opens the platform-owned page. Media files stay under the creator's control and are selected there.

## Queue media kit

Seed assets already live in the app's private Supabase Storage. The Queue now reuses those same workspace-scoped signed URLs instead of creating another media store.

For every publish job, the Queue shows the assets attached to the same Seed:

- images get a small preview;
- video/audio/documents show a clear file-type indicator;
- file size is shown before download;
- **開く** opens the temporary signed asset URL;
- **保存** downloads the asset with its original filename;
- **追加・管理** opens `/app/seeds/:seedId/media`, where more files can be appended to an existing Seed.

If no media exists yet, the Queue shows **素材を追加** instead of leaving the creator to search elsewhere in the app.

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

Zero-cost mode now automates **text preparation + clipboard handoff + opening the platform UI + keeping the correct Seed media beside the post + downloading/opening that media from the same Queue row**.

It still does not inject a local image/video file directly into a third-party site's file input. Browsers and the platforms deliberately restrict cross-site file automation, and bypassing that boundary would make the app much more brittle and riskier for personal accounts.

So the remaining human step is intentionally short: save/select the prepared media in the platform composer, inspect the final preview, and press the platform's own publish button.
