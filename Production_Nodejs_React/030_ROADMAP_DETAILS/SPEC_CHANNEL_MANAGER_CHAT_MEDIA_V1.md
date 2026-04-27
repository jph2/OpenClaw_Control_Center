# SPEC - Channel Manager Chat Media Attachments V1

**Status:** V1 image path implemented; hardening loop active (2026-04-27)  
**Scope:** Channel Manager chat surface only  
**Non-goals:** Workbench media browser, generalized asset management,
multi-file uploader

## 1. Goal

The Channel Manager OpenClaw Chat should support media attachments as structured
chat content, starting with an image plus optional text as one logical chat
message:

- user can paste or attach one image
- user can add optional companion text / caption
- chat history shows image and text as one message
- mirror/read path can render image messages from structured message data
- follow-up phases can add audio, video, and general files without changing the
  chat message model again

## 2. Timing And Dependency

This work is now the next active Channel Manager chat product slice. It was
pulled forward from backlog because the chat surface is stable enough and
operators need to send screenshots, visual context, and later audio/video
material into TTG conversations.

Reason:

- media support is a **Channel Manager chat feature**
- Workbench must not become an implicit upload, clipboard, preview, or file-tree
  dependency
- message modeling should be changed once, in the chat/message layer, not as a
  page-local UI hack
- broader audio/video/file support must wait for explicit gateway, storage,
  retention, and safety gates

## 3. Product Rule

Chat messages are structured content, not only plain text.

The target model supports the media family, but **V1 only activates `text` and
`image`**. Audio/video/file parts are schema-reserved for later phases and must
not be exposed in the UI until their gateway and safety gates are complete.

```ts
type ChatMessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      mediaId: string;
      mimeType: string;
      url?: string;
      width?: number;
      height?: number;
      alt?: string;
    }
  | {
      type: 'audio';
      mediaId: string;
      mimeType: string;
      url?: string;
      durationMs?: number;
      transcriptText?: string;
    }
  | {
      type: 'video';
      mediaId: string;
      mimeType: string;
      url?: string;
      width?: number;
      height?: number;
      durationMs?: number;
      posterUrl?: string;
    }
  | {
      type: 'file';
      mediaId: string;
      mimeType: string;
      filename: string;
      sizeBytes: number;
      url?: string;
    };

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'toolResult';
  createdAt: string;
  parts: ChatMessagePart[];
  senderLabel?: string;
  channelId?: string;
};
```

Compatibility rule:

```ts
parts: [{ type: 'text', text: messageText }]
```

Existing text-only messages must normalize to this shape without changing their
visible behavior.

## 4. Phases And V1 Scope

Phases:

1. **V1 image attachments** — current implementation target.
2. **V1b audio attachments** — after V1 image path proves storage, send, mirror,
   and safety.
3. **V2 video/general files** — after gateway support, storage policy,
   retention policy, and MIME allowlists are explicit.

V1 image scope:

In scope:

- one image per message
- optional text/caption
- paste from clipboard
- optional file picker if low risk
- image preview in the composer
- remove attached image before send
- image rendering in the chat history
- lightweight enlarge/preview behavior on click
- safe backend path for upload, forwarding, or gateway-native media send

Out of scope for the first V1 implementation slice:

- multiple images per message
- PDF/general file upload
- audio/video upload
- Workbench media browser
- generalized media library
- drag-and-drop

Audio/video follow-up gates:

- confirm gateway can send and mirror the media type as structured data
- define per-type size and duration limits
- decide storage lifetime and cleanup/retention behavior
- add explicit MIME allowlist before exposing the picker
- add UI players with no autoplay and clear unavailable placeholders

## 5. UX Rules

Composer:

- textarea remains the primary input
- paste handler accepts one supported image
- attached image appears as preview
- remove button clears the image
- text-only, image-only, and image-plus-text are valid
- multiple images are blocked in V1 or reduced to the first image with clear
  operator feedback
- audio/video/file controls are hidden in V1 and must not appear as disabled
  mystery buttons

History:

- image appears inline in the message bubble
- text/caption appears with the image as one message
- click opens a larger preview
- failed image load shows a clear fallback state
- later audio/video renderers use native controls, no autoplay, and an explicit
  fallback if media cannot be resolved

## 6. Architecture Rules

This is **not** a Workbench feature.

Channel Manager owns:

- chat composer behavior
- send action
- chat message rendering
- chat/mirror message normalization

Backend chat/media layer owns:

- validation
- storage/forwarding/gateway handoff
- media metadata
- inbound/session media normalization

Workbench must not provide:

- clipboard handling
- upload state
- media preview state
- media storage policy

## 7. Send Path

Preferred V1 backend route:

```text
POST /api/chat/:groupId/send-media
```

Payload shape:

```json
{
  "text": "optional caption",
  "image": {
    "filename": "paste.png",
    "mimeType": "image/png",
    "base64": "..."
  }
}
```

Backend responsibilities:

- validate MIME type
- enforce size limit
- ignore untrusted filename semantics
- forward to gateway-native media path if available
- return structured send result
- store only the minimum media metadata required for render/mirror/debug

Fallback rule:

- Do not ship a fake-success UI if the gateway cannot actually send or mirror
  the image.
- A local-only prototype must be explicitly labeled as such and not confused
  with delivered chat media.

## 8. Mirror / Read Path

Session/chat mirror must normalize media events into `parts[]`.

Rules:

- UI renders structured parts only.
- UI must not infer images from raw text markers.
- inbound media that cannot be resolved renders as an explicit unavailable
  placeholder.

## 9. Safety

Allowed MIME types for V1 image:

- `image/png`
- `image/jpeg`
- `image/webp`

Optional later:

- `image/gif`
- `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/wav` after V1b gate
- `video/mp4`, `video/webm` after V2 gate

Not allowed in the first V1 implementation slice:

- SVG
- HTML
- script-capable formats
- arbitrary files
- audio/video/general file upload

Additional constraints:

- V1 implementation limit is 5 MB to match the OpenClaw gateway
  `parseMessageWithAttachments(maxBytes: 5e6)` path.
- define lower audio/video limits separately before enabling those phases
- validate client-side before reading large files into browser memory
- validate server-side even if client validates
- never trust filename
- previews must only use validated sources
- image previews may use `data:` / `blob:` URLs locally, but API URL helpers must
  not rewrite those schemes into relative backend paths.
- mirrored media file serving must reject path separators, `..`, null bytes,
  symlinks, and paths outside the OpenClaw media inbound directory. Responses
  should use an image content type and `X-Content-Type-Options: nosniff`.
- V1 mirror normalization renders only `image/*` media as image parts. Other
  media types remain hidden or explicit unsupported placeholders until V1b/V2.

## 10. Implementation Order

### Current hardening loop (2026-04-27)

The first image implementation landed and needs these hardening fixes before the
slice is considered stable:

1. Fix optimistic image previews so `data:` URLs are rendered directly instead
   of being passed through backend API URL normalization.
2. Add frontend MIME and size checks before `FileReader.readAsDataURL()` for
   paste/file picker inputs.
3. Harden `GET /api/chat/media/inbound/:mediaId` with symlink rejection,
   realpath/scope checks, and `nosniff`.
4. Keep the send path gateway-only for media; CLI fallback must continue to
   fail visibly rather than reporting fake success.
5. Add mirror normalization coverage for `MediaPath(s)` and non-image media.

### V1 image implementation order

1. Confirm Workbench / Channel Manager boundary remains clean.
2. Introduce chat message `parts[]` normalization for existing text-only
   messages.
3. Add composer attachment state for one image.
4. Add clipboard image paste handler and optional file picker.
5. Add image preview and remove action.
6. Add image part renderer and lightweight preview modal.
7. Add backend `send-media` route or gateway-native media send integration.
8. Extend mirror/read normalization for structured media events.
9. Add browser QA for paste image + optional text + send + render.

### Follow-up implementation order

1. Audit V1 image path in real TTG use: send, mirror, storage, unavailable
   placeholders, and retention behavior.
2. Define V1b audio limits and accepted MIME types, then add audio composer
   picker + player renderer.
3. Define V2 video/file policy, including retention and download/open behavior,
   before adding upload controls.

## 11. Acceptance Criteria

V1 image acceptance:

- User can paste one image into the Channel Manager chat composer.
- User can send image-only and image-plus-text messages.
- Text-only chat behavior remains unchanged.
- Chat history displays image and text as one logical message.
- Mirror/read path renders image messages from structured data.
- Unsupported media produces clear feedback.
- No Workbench dependency is introduced.
- Build, tests, and E2E remain green.

Audio/video/file acceptance is intentionally deferred until the follow-up gate
defines MIME, size, duration, retention, gateway, and mirror behavior.

