# Meta Audio 131053 Fallback Specification

## Context

LiveChat V2 sends recorded WhatsApp audio as OGG/Opus. Meta can asynchronously
reject a valid, decodable OGG/Opus message with error code `131053` and the
details `Audio file uploaded with mimetype as audio/ogg; codecs=opus, however
on processing it is of type application/octet-stream`.

The investigation reproduced the failure through both `audio.link` and direct
Meta media upload followed by `audio.id`. The same failing audio delivered when
transcoded to AAC in an M4A container and sent as a non-voice audio message.

## Goal

For an eligible outbound LiveChat WhatsApp voice message that receives Meta
status `failed` with code `131053`, automatically send exactly one AAC/M4A
fallback audio message to the same recipient.

## In Scope

- Keep the initial OGG/Opus voice-note behavior unchanged.
- Process only Meta Cloud API status webhooks for an outbound human WhatsApp
  audio message whose persisted payload has `audio.voice === true`.
- Download the original stored audio, transcode it to mono AAC/M4A, upload it
  to Meta as media, and send it with `voice: false`.
- Persist and show the fallback as a separate message, linked to its original
  message through `objMessage.chatfunnelAudioFallback`.
- Ensure duplicate webhooks cannot create duplicate fallback messages.

## Out of Scope

- Retrying arbitrary Meta failures, WAHA messages, inbound media, templates,
  or messages outside the WhatsApp customer-service window.
- Replacing normal OGG/Opus voice notes with M4A for every message.
- Hiding or changing the original message's `ERROR` status.
- Database schema migrations. The existing `Messages.objMessage` JSON field
  stores the durable fallback marker for this scoped fix.

## Acceptance Criteria

1. A qualifying `131053` status creates one M4A fallback message and sends it
   through Meta using `audio.id` with `voice: false`.
2. Repeated status webhooks, concurrent handlers, and process restarts do not
   create a second fallback for the same original message.
3. Non-audio messages, non-voice audio, non-`131053` errors, and WAHA channels
   remain unchanged.
4. The fallback message has its own Meta `wamid`, status updates normally, and
   is rendered as a playable non-voice audio item in LiveChat.
5. Temporary files are removed on both success and failure; logs contain only
   identifiers and error codes, never access tokens or audio bytes.
