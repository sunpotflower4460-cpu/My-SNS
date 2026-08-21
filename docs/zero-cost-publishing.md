# Zero-cost publishing mode

My-SNS now defaults to a **zero-cost publishing strategy**.

The goal is practical personal use from one place without requiring paid posting APIs:

1. Create one Seed.
2. Attach the image/video/audio/document assets that belong to it. Assets can also be added later from the Seed media manager.
3. Generate/edit drafts for each target channel.
4. Approve the final Revision.
5. Add it to the publish Queue.
6. Open the Publish Pack or Queue and keep the final text and Seed assets together.
7. On a compatible HTTPS mobile browser, press **「スマホで共有」** to hand the post text plus Seed image/video files to the OS share sheet and choose an available target app.
8. If the device/browser/target app does not accept that combination, use the existing **「Xへ投稿」「Instagramへ投稿」「YouTubeへ投稿」「TikTokへ投稿」「noteへ投稿」** handoff plus **開く・保存** media actions.
9. Inspect the final post inside the platform, press the platform's own publish button, then return to My-SNS and press **「投稿済みにする」**.

## Why this is the default

`zero-cost` deliberately keeps the final publish action human-confirmed. It avoids external posting charges and avoids pretending that a media upload succeeded when a platform requires review, quota, account type, or an app audit.

X receives a stronger browser handoff: My-SNS uses X Web Intent, so the approved post text is pre-filled in X's own composer without an X API key. The same text is also copied to the clipboard.

For Instagram, YouTube, TikTok, note, Threads, Facebook, and LINE, the browser handoff copies the prepared text and opens the platform-owned page. Media files stay under the creator's control and are selected there.

## Mobile Web Share fast path

My-SNS also exposes an additive Web Share fast path on compatible devices.

- The button is only shown in a secure context when `navigator.share()` is available.
- Only Seed **image/video** assets are handed to the native share sheet; audio/documents keep the existing explicit open/download workflow.
- Signed asset URLs are fetched and converted into browser `File` objects with their original filenames.
- Before sharing files, My-SNS checks `navigator.canShare({ files })` when file sharing is required.
- The approved channel-specific text is included with the share request.
- The destination is chosen by the user from the OS share sheet; My-SNS does not assume that a specific social app is installed or available.
- If any intended media cannot be fetched, My-SNS fails closed instead of silently omitting an attachment.

Web Share requires transient user activation. Some mobile browsers retain that activation while private media finishes downloading and can open the share sheet from one tap. Others expire activation during the fetch. In that case My-SNS keeps the prepared `File` objects in memory and changes the action to **「共有シートを開く」**, so the second tap calls `navigator.share()` immediately.

A receiving app may still ignore text, reject multiple files, or expose a different composer depending on OS/app behavior. That is why the established platform handoff and per-file open/save controls remain available as the reliable fallback.

## Queue media kit

Seed assets already live in the app's private Supabase Storage. The Queue now reuses those same workspace-scoped signed URLs instead of creating another media store.

For every publish job, the Queue shows the assets attached to the same Seed:

- images get a small preview;
- video/audio/documents show a clear file-type indicator;
- file size is shown before download;
- **開く** opens the temporary signed asset URL;
- **保存** downloads the asset with its original filename;
- **追加・管理** opens `/app/seeds/:seedId/media`, where more files can be appended to an existing Seed;
- compatible mobile browsers additionally get **スマホで共有** on the channel action card.

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

Zero-cost mode now automates **text preparation + clipboard/platform handoff + keeping the correct Seed media beside the post + mobile Web Share where the browser supports it + explicit media open/download fallback**.

It still does not inject a local image/video file directly into a third-party website's file input. Browsers and platforms deliberately restrict cross-site file automation, and bypassing that boundary would make the app much more brittle and riskier for personal accounts.

The final platform-side confirmation therefore remains intentional: inspect what the receiving app actually accepted, adjust if necessary, and press that platform's own publish button.