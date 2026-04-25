# SPEC - Channel Manager Chat Media V1

**Status:** proposed  
**Scope:** Channel Manager chat surface only  
**Non-goals:** Workbench media browser, generalized asset management,
multi-file uploader

## 1. Goal

The Channel Manager OpenClaw Chat should support an image plus optional text as
one logical chat message:

- user can paste or attach one image
- user can add optional companion text / caption
- chat history shows image and text as one message
- mirror/read path can render image messages from structured message data

## 2. Timing And Dependency

This work belongs **after** the Workbench / Channel Manager boundary cleanup and
after the current §8b.5 bridge foundation is stable enough.

Reason:

- media support is a **Channel Manager chat feature**
- Workbench must not become an implicit upload, clipboard, preview, or file-tree
  dependency
- message modeling should be changed once, in the chat/message layer, not as a
  page-local UI hack

## 3. Product Rule

Chat messages are structured content, not only plain text.

V1 supports these parts:

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

## 4. V1 Scope

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

Out of scope:

- multiple images per message
- PDF/general file upload
- video/audio
- Workbench media browser
- generalized media library
- drag-and-drop

## 5. UX Rules

Composer:

- textarea remains the primary input
- paste handler accepts one supported image
- attached image appears as preview
- remove button clears the image
- text-only, image-only, and image-plus-text are valid
- multiple images are blocked in V1 or reduced to the first image with clear
  operator feedback

History:

- image appears inline in the message bubble
- text/caption appears with the image as one message
- click opens a larger preview
- failed image load shows a clear fallback state

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

Allowed MIME types:

- `image/png`
- `image/jpeg`
- `image/webp`

Optional later:

- `image/gif`

Not allowed in V1:

- SVG
- HTML
- script-capable formats
- arbitrary files

Additional constraints:

- define size limit before implementation, proposed default: 10 MB
- validate server-side even if client validates
- never trust filename
- previews must only use validated sources

## 10. Implementation Order

1. Confirm Workbench / Channel Manager boundary remains clean.
2. Introduce chat message `parts[]` normalization for text-only messages.
3. Add composer attachment state.
4. Add clipboard image paste handler.
5. Add image preview and remove action.
6. Add image part renderer and lightweight preview modal.
7. Add backend `send-media` route or gateway-native media send integration.
8. Extend mirror/read normalization for media.
9. Add browser QA for paste image + optional text + send + render.

## 11. Acceptance Criteria

- User can paste one image into the Channel Manager chat composer.
- User can send image-only and image-plus-text messages.
- Text-only chat behavior remains unchanged.
- Chat history displays image and text as one logical message.
- Mirror/read path renders image messages from structured data.
- Unsupported media produces clear feedback.
- No Workbench dependency is introduced.
- Build, tests, and E2E remain green.

