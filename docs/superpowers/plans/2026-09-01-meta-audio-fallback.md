# Meta Audio 131053 Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically resend a LiveChat WhatsApp voice note as playable AAC/M4A when Meta asynchronously rejects its OGG/Opus version with error `131053`.

**Architecture:** Keep the existing OGG/Opus first attempt and webhook status persistence. When `processInfoMessage` persists an eligible `failed` status, it starts a guarded background fallback: claim the original message, download its stored S3 media, transcode it to M4A, upload it directly to Meta, send a new non-voice audio message by Meta media ID, then persist and broadcast that separate fallback message. The fallback marker in the new message's `objMessage` is the durable idempotency record; a Redis `SET NX EX` lock only prevents concurrent processing while it is being created.

**Tech Stack:** Node.js/CommonJS API, TypeScript `@chatfunnel/core`, Prisma client, Redis, fluent-ffmpeg, S3, Meta Graph Cloud API, Jest.

**Spec:** `docs/superpowers/specs/2026-09-01-meta-audio-fallback.md`

## Global Constraints

- Preserve the current OGG/Opus first attempt and only react to Meta status code `131053`.
- Limit the feature to official Cloud API channels and outbound human WhatsApp voice audio.
- Scope every new Prisma read/update by `accountId` through `channel.accountId` and include `isDeleted: false` where the model supports soft deletion.
- Do not read from or execute commands against a real database; do not generate or apply Prisma migrations.
- Do not log Meta access tokens, authorization headers, signed URLs, or media contents.
- Do not run `npm run build`; use focused Jest invocations that do not invoke the API package `pretest` build hook.
- Do not commit unless the user explicitly requests it.

---

## File Structure

- Modify: `chatfunnel-core/src/meta/cloud.api.ts` — allow `sendAudioMessage` callers to choose `voice: false` while preserving the existing default and supporting Meta `audio.id`.
- Create: `chatfunnel-core/src/meta/cloud.api.spec.ts` — lock the outbound Meta payload contract for voice and non-voice audio IDs.
- Create: `chatfunnel-api/src/commands/whatsapp/Audio131053Fallback.js` — eligibility, durable claim, source download, M4A conversion, direct Meta upload, persistence, socket emission, cleanup, and structured logs.
- Create: `chatfunnel-api/src/commands/whatsapp/Audio131053Fallback.test.js` — unit tests for eligibility, duplicate protection, conversion cleanup, and failed operations.
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/handler.js` — pass the resolved channel/account context into status processing and trigger the fallback after the original error is persisted.
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/handler.test.js` — test webhook routing for the exact Meta failure and no-op cases.
- Modify: `chatfunnel-api/src/commands/contacts/SendMessageToContact.js` — extract the existing message persistence/socket emission into an exported helper reusable by the fallback without creating an HTTP request.
- Create: `vault/wiki/gotchas/meta-audio-131053-fallback.md` — document the reproduction and why fallback occurs only after the asynchronous status.
- Modify: `vault/wiki/gotchas/_index.md` — link the new gotcha page.

### Task 1: Extend the Cloud API audio contract

**Files:**
- Modify: `chatfunnel-core/src/meta/cloud.api.ts:334-355`
- Create: `chatfunnel-core/src/meta/cloud.api.spec.ts`

**Interfaces:**
- Produces: `sendAudioMessage(phoneNumberId, recipientNumber, media, options?)` where `options.voice` defaults to `true`.
- Produces: a Meta payload with exactly one of `audio.link` or `audio.id`.
- Consumes: existing `CloudApi.uploadFile(phoneNumberId, filename, mimetype)` which returns a Meta media ID.

- [ ] **Step 1: Write the failing payload tests**

```ts
it("sends a voice note by link by default", async () => {
  await api.sendAudioMessage("phone-id", "5511999999999", { url: "https://s3/audio.ogg" });
  expect(post).toHaveBeenCalledWith("/phone-id/messages", expect.objectContaining({
    type: "audio",
    audio: { voice: true, link: "https://s3/audio.ogg" },
  }));
});

it("sends an M4A fallback by Meta media ID without voice-note mode", async () => {
  await api.sendAudioMessage("phone-id", "5511999999999", { metaId: "meta-media-id" }, { voice: false });
  expect(post).toHaveBeenCalledWith("/phone-id/messages", expect.objectContaining({
    type: "audio",
    audio: { voice: false, id: "meta-media-id" },
  }));
});
```

- [ ] **Step 2: Run the focused Core test and verify it fails**

Run: `cd chatfunnel-core; npx jest src/meta/cloud.api.spec.ts --runInBand`

Expected: FAIL because `sendAudioMessage` has no fourth argument and always sets `voice: true`.

- [ ] **Step 3: Add the optional voice argument without changing current callers**

```ts
type SendAudioOptions = { voice?: boolean };

async sendAudioMessage(
  phoneNumberId: string,
  recipientNumber: string,
  message: { url?: string; metaId?: string },
  options: SendAudioOptions = {},
): Promise<SendMessageResult> {
  const data: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipientNumber,
    type: "audio",
    audio: { voice: options.voice ?? true },
  };
  // Preserve the existing mutually-exclusive link/metaId selection below.
}
```

- [ ] **Step 4: Run the focused Core test and verify it passes**

Run: `cd chatfunnel-core; npx jest src/meta/cloud.api.spec.ts --runInBand`

Expected: PASS with both payload assertions satisfied.

- [ ] **Step 5: Do not commit automatically**

Leave the change uncommitted for user review; the workspace rule prohibits automatic commits.

### Task 2: Create a tested M4A fallback service

**Files:**
- Create: `chatfunnel-api/src/commands/whatsapp/Audio131053Fallback.js`
- Create: `chatfunnel-api/src/commands/whatsapp/Audio131053Fallback.test.js`

**Interfaces:**
- Consumes: `{ accountId, channel, statusMessage }` and the original `Messages` row.
- Produces: `{ action: "ignored" | "duplicate" | "sent" | "failed", originalMessageId: string }`.
- Produces: a fallback payload marker:

```js
{
  chatfunnelAudioFallback: {
    originalMessageId: "uuid",
    originalWamid: "wamid...",
    failureCode: 131053,
    format: "audio/mp4",
  }
}
```

- [ ] **Step 1: Write failing service tests for eligibility and idempotency**

```js
it("ignores a failed text message", async () => {
  const result = await service.handle({ accountId, channel, statusMessage: failed131053 });
  expect(result.action).toBe("ignored");
  expect(cloudApi.uploadFile).not.toHaveBeenCalled();
});

it("creates only one fallback when Meta redelivers the same 131053 webhook", async () => {
  await service.handle({ accountId, channel, statusMessage: failed131053 });
  await service.handle({ accountId, channel, statusMessage: failed131053 });
  expect(persistFallbackMessage).toHaveBeenCalledTimes(1);
  expect(cloudApi.sendAudioMessage).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused API service test and verify it fails**

Run: `cd chatfunnel-api; npx jest src/commands/whatsapp/Audio131053Fallback.test.js --runInBand`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement exact eligibility and durable duplicate checks**

Implement `isEligibleAudio131053(message, statusMessage, channel)` with all of these predicates:

```js
statusMessage.status === "failed" &&
statusMessage.errors?.[0]?.code === 131053 &&
channel.provider !== "WAHA" &&
message.from === "HUMAN" &&
message.type === "WHATSAPP" &&
message.isDeleted === false &&
message.objMessage?.type === "audio" &&
message.objMessage?.audio?.voice === true &&
typeof message.objMessage?.audio?.link === "string";
```

Before work starts, acquire `SET NX EX` for key
`meta-audio-fallback:${accountId}:${message.id}` with a 15-minute TTL. Then
query for an existing non-deleted fallback `Messages` row scoped through
`channel.accountId === accountId` whose JSON marker path is
`chatfunnelAudioFallback.originalMessageId === message.id`. Return `duplicate`
if either a durable row already exists or another worker owns the lock.

- [ ] **Step 4: Implement conversion, upload, send, and cleanup**

Use a unique OS temporary directory. Download only the original persisted
`objMessage.audio.link`, write `source.ogg`, then run fluent-ffmpeg with this
M4A output contract:

```js
command
  .audioCodec("aac")
  .audioBitrate("48k")
  .audioChannels(1)
  .audioFrequency(44100)
  .audioFilters("aformat=sample_fmts=s16:channel_layouts=mono")
  .toFormat("mp4");
```

Upload the resulting `.m4a` through `CloudApi.uploadFile(channel.wppPhoneNumberId, outputPath, "audio/mp4")`, then call:

```js
api.sendAudioMessage(
  channel.wppPhoneNumberId,
  recipient,
  { metaId },
  { voice: false },
);
```

Always remove the temporary directory in `finally`. On error, log the action,
account ID, channel ID, original message ID, original `wamid`, and sanitized
error code/message; never log `wppAccessToken` or the source URL.

- [ ] **Step 5: Add persistence-ready success and failure tests**

```js
it("uploads M4A and sends it by Meta ID with voice false", async () => {
  const result = await service.handle({ accountId, channel, statusMessage: failed131053 });
  expect(cloudApi.uploadFile).toHaveBeenCalledWith(channel.wppPhoneNumberId, expect.stringMatching(/\.m4a$/), "audio/mp4");
  expect(cloudApi.sendAudioMessage).toHaveBeenCalledWith(channel.wppPhoneNumberId, recipient, { metaId: "meta-id" }, { voice: false });
  expect(result.action).toBe("sent");
});

it("removes temporary files when ffmpeg rejects the source", async () => {
  ffmpegMock.emit("error", new Error("conversion failed"));
  await expect(service.handle({ accountId, channel, statusMessage: failed131053 })).resolves.toMatchObject({ action: "failed" });
  expect(removeTempDirectory).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Run the focused service test and verify it passes**

Run: `cd chatfunnel-api; npx jest src/commands/whatsapp/Audio131053Fallback.test.js --runInBand`

Expected: PASS for ignored, duplicate, success, and cleanup paths.

- [ ] **Step 7: Do not commit automatically**

Leave the change uncommitted for user review.

### Task 3: Persist and broadcast the fallback message

**Files:**
- Modify: `chatfunnel-api/src/commands/contacts/SendMessageToContact.js:491-518`
- Modify: `chatfunnel-api/src/commands/whatsapp/Audio131053Fallback.js`
- Modify: `chatfunnel-api/src/commands/whatsapp/Audio131053Fallback.test.js`

**Interfaces:**
- Produces: exported `persistOutboundMessageAndBroadcast({ account, channel, contact, user, response, payload, conversationId })`.
- Consumes: successful Meta response containing `data.message_id` and `payload`.
- Produces: a `Messages` row with the fallback marker plus the normal `add-message` socket event.

- [ ] **Step 1: Write the failing persistence test**

```js
it("persists the fallback as a separate SENT message and emits add-message", async () => {
  await persistFallbackMessage({ originalMessage, metaResponse, m4aUrl, metaId });
  expect(prisma.messages.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      messageId: "wamid.fallback",
      status: "SENT",
      objMessage: expect.objectContaining({
        audio: expect.objectContaining({ link: m4aUrl, voice: false }),
        chatfunnelAudioFallback: expect.objectContaining({ originalMessageId: originalMessage.id }),
      }),
    }),
  }));
  expect(global.signalR.emit).toHaveBeenCalledWith("broadcast", expect.objectContaining({
    payload: expect.objectContaining({ type: "add-message" }),
  }));
});
```

- [ ] **Step 2: Extract the existing persistence/socket sequence**

Move the `prisma.messages.create`, contact last-update, and `global.signalR.emit`
sequence around `SendMessageToContact.js:491-518` into the exported helper.
Keep the existing HTTP send behavior byte-for-byte equivalent by making its
current call site invoke the helper with its current arguments.

- [ ] **Step 3: Persist the converted M4A before exposing it to LiveChat**

Generate `fallbackMediaId = randomUUID()` and use the exact S3 key
`${accountId}/storage/${fallbackMediaId}.m4a`. Upload with
`new S3Class().upload({ filename: outputPath, mimetype: "audio/mp4" }, key)`.
Then create the corresponding scoped media row:

```js
await prisma.medias.create({
  data: {
    id: fallbackMediaId,
    accountId,
    url: fallbackS3Url,
    mimetype: "audio/mp4",
    filename: outputPath,
    originalname: "audio-fallback.m4a",
    size: outputSize,
    showGallery: false,
  },
});
```

Persist `fallbackS3Url` in the fallback message's `objMessage.audio.link` so
LiveChat can play history, while Meta is sent only by `metaId`.

- [ ] **Step 4: Run focused fallback and existing send-message tests**

Run: `cd chatfunnel-api; npx jest src/commands/whatsapp/Audio131053Fallback.test.js src/commands/instagram/WebHookHandler/handler.test.js --runInBand`

Expected: PASS; existing sent-message payloads and socket events remain unchanged.

- [ ] **Step 5: Do not commit automatically**

Leave the change uncommitted for user review.

### Task 4: Trigger the fallback from the Meta status webhook

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/handler.js:209-294`
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/handler.test.js:105-125`
- Modify: `chatfunnel-api/src/commands/whatsapp/Audio131053Fallback.js`

**Interfaces:**
- Consumes: the resolved channel, account ID, original outgoing message, and a single Meta status payload.
- Produces: unchanged original `ERROR` persistence followed by one asynchronous fallback attempt.

- [ ] **Step 1: Add failing webhook tests for the exact trigger**

```js
it("starts one fallback after persisting a failed 131053 voice audio status", async () => {
  await webhookHandler({ body: whatsappFailed131053VoicePayload }, response);
  expect(prisma.messages.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "ERROR" }),
  }));
  expect(audio131053Fallback.handle).toHaveBeenCalledWith(expect.objectContaining({
    statusMessage: expect.objectContaining({ status: "failed" }),
  }));
});

it("does not start fallback for code 131026 or non-audio messages", async () => {
  await webhookHandler({ body: nonEligibleFailurePayload }, response);
  expect(audio131053Fallback.handle).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Thread channel and account scope through status processing**

Change `processStatuses(id, stats)` to resolve a non-deleted channel including
its `accountId`, then call `processInfoMessage(channel, statusMessage)`. Query
the original message with `messageId`, `channelId`, `isDeleted: false`, and
`channel: { accountId: channel.accountId }`; do not use an unscoped `messageId`
lookup for the new fallback path.

- [ ] **Step 3: Preserve status handling, then fire-and-observe fallback**

After `prisma.messages.updateMany` persists `status: "ERROR"`, invoke the
fallback service without delaying the webhook response:

```js
audio131053Fallback
  .handle({ accountId: channel.accountId, channel, statusMessage })
  .catch((error) => console.error("[meta-audio-fallback] unexpected failure", {
    accountId: channel.accountId,
    channelId: channel.id,
    wamid: statusMessage.id,
    message: error?.message,
  }));
```

Keep `res.status(200).json({})` unchanged so Meta webhook acknowledgement is
never blocked by download, ffmpeg, S3, or a second Meta send.

- [ ] **Step 4: Run webhook tests and verify all status behavior**

Run: `cd chatfunnel-api; npx jest src/commands/instagram/WebHookHandler/handler.test.js src/commands/whatsapp/Audio131053Fallback.test.js --runInBand`

Expected: PASS for delivered/read/ordinary failed statuses plus the new 131053 fallback cases.

- [ ] **Step 5: Do not commit automatically**

Leave the change uncommitted for user review.

### Task 5: Document and manually validate the complete asynchronous flow

**Files:**
- Create: `vault/wiki/gotchas/meta-audio-131053-fallback.md`
- Modify: `vault/wiki/gotchas/_index.md`

**Interfaces:**
- Consumes: final behavior from Tasks 1-4.
- Produces: a support runbook with Grafana fields, expected LiveChat states, and a manual acceptance script.

- [ ] **Step 1: Add the gotcha/runbook entry**

Document these fixed facts: Meta may accept the initial send but later reject
OGG/Opus with `131053`; `200` from the API is not delivery; the reliable
trigger is the asynchronous status webhook; AAC/M4A sent with `voice: false`
was validated to play in WhatsApp mobile; fallback has one attempt only.

- [ ] **Step 2: Add manual acceptance instructions**

Include this exact checklist:

```text
1. Send a known reproducing LiveChat V2 voice recording to a test contact.
2. Confirm the original message becomes ERROR with Meta code 131053.
3. Confirm one additional non-voice M4A message appears in the same conversation.
4. Confirm it reaches WhatsApp Web and the mobile app and plays in both.
5. Replay the same failed status payload; confirm no additional fallback message appears.
6. Send a normal OGG voice note; confirm no M4A fallback is created.
```

- [ ] **Step 3: Add observability checks**

Document LogQL filters using the original and fallback `wamid` values:

```logql
{container=~"front-api|flow-worker"} |= "[meta-audio-fallback]"
{container=~"front-api|flow-worker"} |= "131053"
```

- [ ] **Step 4: Run the focused regression suite**

Run: `cd chatfunnel-core; npx jest src/meta/cloud.api.spec.ts --runInBand`

Run: `cd ../chatfunnel-api; npx jest src/commands/whatsapp/Audio131053Fallback.test.js src/commands/instagram/WebHookHandler/handler.test.js --runInBand`

Expected: all focused tests PASS. Do not run `npm run build`.

- [ ] **Step 5: Do not commit automatically**

Present the diff and validation results for user approval instead of committing.

## Self-Review

- **Spec coverage:** Tasks 1-4 cover the initial OGG preservation, exact 131053 trigger, M4A conversion/direct Meta media upload, separate message persistence, idempotency, and cleanup. Task 5 covers operational discovery and manual verification.
- **Placeholder scan:** All files, interfaces, predicates, payload shapes, tests, commands, and no-commit constraints are specified; no TBD/TODO steps remain.
- **Type consistency:** `CloudApi.sendAudioMessage(..., { voice: false })` is introduced in Task 1 and consumed by Task 2. The fallback marker written in Task 3 is the marker queried for deduplication in Task 2. Task 4 supplies the `{ accountId, channel, statusMessage }` input required by Task 2.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-01-meta-audio-fallback.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, with checkpoints for review.
