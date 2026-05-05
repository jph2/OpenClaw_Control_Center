import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Copy, Image, ChevronRight, Wrench, X, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatSession } from '../hooks/useChatSession';
import { apiUrl } from '../utils/apiUrl';

const RENDER_PLUGINS = [remarkGfm];

/** Channel Manager chat — Look & Feel: accent as border/highlight only, not full user-bubble fill */
const ACCENT = '#50e3c2';
const BUBBLE_BG = '#2a2b36';
const BUBBLE_TEXT = '#e0e0e0';
const INLINE_CODE_BORDER = 'rgba(255,255,255,0.14)';
const FENCED_BORDER = 'rgba(255,255,255,0.16)';
const CHAT_IMAGE_MAX_BYTES = 5_000_000;
const CHAT_IMAGE_MIME_WHITELIST = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
]);

/** Preview length for the header chip of a collapsed tool output. */
const TOOL_OUTPUT_PREVIEW_CHARS = 72;

/**
 * Drop the flattened `⚙️ [Tool Call: name]` markers the backend still
 * emits inline with the bubble text. We render those as structured chips
 * below the bubble, so they don't need to appear twice.
 */
const stripToolCallMarkers = (text) => {
    if (!text) return '';
    return text
        .replace(/⚙️\s*\[Tool Call:[^\]]+\]\s*/g, '')
        .replace(/✅\s*\[Tool Result:[^\]]+\]\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/**
 * OpenClaw may attach `model` to assistant bubbles that only report a failed
 * attempt (no successful completion). Those must not drive the header "live" chip.
 */
const isFailedAttemptAssistantModel = (msg) => {
    if (!msg || msg.senderRole !== 'assistant' || !msg.model) return false;
    const modelTag = String(msg.model || '').toLowerCase();
    if (modelTag.includes('gateway-injected')) return true;
    const t = String(msg.text || '').trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    if (lower.includes('agent failed') || lower.includes('before reply')) return true;
    if (lower.includes('no api key')) return true;
    if (lower.includes('request failed')) return true;
    if (lower.includes('unknown model')) return true;
    return false;
};

const copyTextToClipboard = async (text) => {
    if (!text) return;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(textarea);
    }
};

const normalizeModelForCompare = (model) => {
    const value = String(model || '').trim().toLowerCase();
    if (!value) return '';
    const slash = value.lastIndexOf('/');
    return slash >= 0 ? value.slice(slash + 1) : value;
};

/** Build `provider/model` id when OpenClaw `sessions.json` stores split fields. */
const compositeModelIdFromHints = (hints) => {
    if (!hints || typeof hints !== 'object') return '';
    const po = hints.providerOverride;
    const mo = hints.modelOverride;
    if (typeof po === 'string' && po && typeof mo === 'string' && mo) return `${po}/${mo}`;
    const lp = hints.lastResolvedProvider;
    const lm = hints.lastResolvedModel;
    if (typeof lp === 'string' && lp && typeof lm === 'string' && lm) return `${lp}/${lm}`;
    return '';
};

/**
 * Render one argument object as human-readable JSON for the expanded
 * tool-call chip. Safe against non-serialisable values.
 */
const safeStringifyToolInput = (input) => {
    if (input == null) return '';
    try {
        return JSON.stringify(input, null, 2);
    } catch {
        return String(input);
    }
};

/**
 * Collapsible chip under an assistant bubble: shows "⚙ exec" by default,
 * click to reveal the tool input as a pre-formatted JSON block.
 */
const ToolCallChip = ({ call }) => {
    const [open, setOpen] = useState(false);
    // Treat any non-null scalar (string/number/bool) as printable input;
    // only collapse an object check to "has at least one own key" so the
    // chip doesn't go dead on `{"command": "..."}` payloads. Previously
    // the chip relied on `b.input` which the current gateway build
    // writes under `b.arguments`, and the button ended up permanently
    // disabled.
    const input = call?.input;
    const hasInput =
        input != null &&
        (typeof input !== 'object'
            ? String(input).length > 0
            : Object.keys(input).length > 0);
    return (
        <div style={{ marginTop: '6px' }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={!hasInput}
                title={hasInput ? 'Tool input anzeigen / verbergen' : 'Tool call (keine sichtbaren Argumente)'}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(80,227,194,0.10)',
                    border: '1px solid rgba(80,227,194,0.35)',
                    color: '#9ff0dc',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '10.5px',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    cursor: hasInput ? 'pointer' : 'default',
                    opacity: hasInput ? 1 : 0.7
                }}
            >
                <ChevronRight
                    size={12}
                    style={{
                        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.12s ease'
                    }}
                />
                <Wrench size={12} />
                <span>{call.name}</span>
            </button>
            {open && hasInput && (
                <pre
                    style={{
                        marginTop: '4px',
                        background: 'rgba(0,0,0,0.28)',
                        border: `1px solid ${FENCED_BORDER}`,
                        padding: '8px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        maxWidth: '100%',
                        maxHeight: '240px',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: BUBBLE_TEXT
                    }}
                >
                    {safeStringifyToolInput(call.input)}
                </pre>
            )}
        </div>
    );
};

/**
 * Entire bubble for a toolResult-role message. Collapsed by default to
 * hide long exec output / log dumps; click to expand.
 */
const ToolResultBubble = ({ msg, stamp }) => {
    const [open, setOpen] = useState(false);
    const first = msg.toolResults?.[0] || null;
    const output = first?.output ?? msg.text ?? '';
    const toolName = first?.toolName || 'tool';
    const isError = first?.isError === true;
    const singleLine = String(output).replace(/\s+/g, ' ').trim();
    const preview = singleLine.slice(0, TOOL_OUTPUT_PREVIEW_CHARS);
    const truncated = singleLine.length > TOOL_OUTPUT_PREVIEW_CHARS;
    const accent = isError ? '#ff8f8f' : '#9ff0dc';
    const border = isError ? 'rgba(255,143,143,0.35)' : 'rgba(80,227,194,0.30)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px', marginLeft: '8px', fontWeight: 600 }}>
                {isError ? 'Tool error' : 'Tool output'} · {toolName}
            </div>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    maxWidth: '85%',
                    textAlign: 'left',
                    background: 'rgba(42,43,54,0.65)',
                    border: `1px solid ${border}`,
                    color: accent,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    cursor: 'pointer'
                }}
                title="Tool output anzeigen / verbergen"
            >
                <ChevronRight
                    size={12}
                    style={{
                        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.12s ease',
                        flexShrink: 0
                    }}
                />
                <Wrench size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#c8c8d0' }}>
                    {preview || '(empty output)'}{truncated ? '…' : ''}
                </span>
            </button>
            {open && (
                <pre
                    style={{
                        marginTop: '4px',
                        maxWidth: '85%',
                        background: 'rgba(0,0,0,0.32)',
                        border: `1px solid ${FENCED_BORDER}`,
                        padding: '10px 12px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        maxHeight: '360px',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: BUBBLE_TEXT
                    }}
                >
                    {output}
                </pre>
            )}
            <div style={{ fontSize: '9px', color: '#666', marginTop: '3px', marginLeft: '8px' }}>
                {stamp}
            </div>
        </div>
    );
};

// OPTIMIZED: Static helper functions defined outside component to prevent recreation on every render
const cleanMessageTextStatic = (text, showSystem) => {
    if (showSystem) return text;
    
    let cleaned = text;
    cleaned = cleaned.replace(/\[\[reply_to_current\]\]\s*/g, '');
    cleaned = cleaned.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```json[\s\S]*?```\s*/g, '');
    cleaned = cleaned.replace(/Sender \(untrusted metadata\):[\s\S]*?```json[\s\S]*?```\s*/g, '');
    
    return cleaned.trim();
};

const isUntrustedSystemNoiseStatic = (text) => {
    const normalized = String(text || '').trim();
    if (!normalized) return false;

    return (
        normalized.startsWith('System (untrusted):') ||
        normalized.startsWith('Read HEARTBEAT.md if it exists') ||
        normalized.includes('Exec completed (') ||
        normalized.includes('Exec failed (') ||
        normalized.includes('Exec completed') ||
        normalized.includes('Exec failed')
    );
};

const RENDER_COMPONENTS = {
    p: ({ node: _node, ...props }) => <p style={{ margin: '0 0 10px 0', color: BUBBLE_TEXT }} {...props} />,
    pre: ({ node: _node, ...props }) => (
        <pre
            style={{
                background: 'rgba(0,0,0,0.28)',
                border: `1px solid ${FENCED_BORDER}`,
                padding: '10px 12px',
                borderRadius: '6px',
                overflowX: 'auto',
                margin: '10px 0',
                color: BUBBLE_TEXT
            }}
            {...props}
        />
    ),
    code: ({ node: _node, inline, className, children, ...props }) =>
        inline ? (
            <code
                style={{
                    background: 'rgba(0,0,0,0.22)',
                    border: `1px solid ${INLINE_CODE_BORDER}`,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: '12.5px',
                    color: BUBBLE_TEXT
                }}
                {...props}
            >
                {children}
            </code>
        ) : (
            <code style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: '0.9em', color: BUBBLE_TEXT }} className={className} {...props}>
                {children}
            </code>
        ),
    ul: ({ node: _node, ...props }) => <ul style={{ paddingLeft: '24px', marginBottom: '10px', marginTop: '0', color: BUBBLE_TEXT }} {...props} />,
    ol: ({ node: _node, ...props }) => <ol style={{ paddingLeft: '24px', marginBottom: '10px', marginTop: '0', color: BUBBLE_TEXT }} {...props} />,
    li: ({ node: _node, ...props }) => <li style={{ marginBottom: '4px' }} {...props} />,
    a: ({ node: _node, ...props }) => <a style={{ color: ACCENT, textDecoration: 'none' }} {...props} />,
    h1: ({ node: _node, ...props }) => <h1 style={{ color: BUBBLE_TEXT, fontSize: '1.15em', margin: '8px 0 6px' }} {...props} />,
    h2: ({ node: _node, ...props }) => <h2 style={{ color: BUBBLE_TEXT, fontSize: '1.05em', margin: '8px 0 6px' }} {...props} />,
    h3: ({ node: _node, ...props }) => <h3 style={{ color: BUBBLE_TEXT, fontSize: '1em', margin: '6px 0 4px' }} {...props} />
};

function fileToImagePayload(file) {
    return new Promise((resolve, reject) => {
        const mime = String(file?.type || '').split(';')[0].trim().toLowerCase();
        if (!CHAT_IMAGE_MIME_WHITELIST.has(mime)) {
            reject(new Error('unsupported_image_type'));
            return;
        }
        if (!Number.isFinite(file?.size) || file.size <= 0) {
            reject(new Error('empty_image'));
            return;
        }
        if (file.size > CHAT_IMAGE_MAX_BYTES) {
            reject(new Error('image_too_large'));
            return;
        }
        const r = new FileReader();
        r.onload = () => {
            const dataUrl = String(r.result || '');
            const m = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl);
            if (!m) {
                reject(new Error('read failed'));
                return;
            }
            resolve({
                previewUrl: dataUrl,
                mimeType: m[1],
                base64: m[2],
                filename: file.name || 'image'
            });
        };
        r.onerror = () => reject(r.error || new Error('read error'));
        r.readAsDataURL(file);
    });
}

function resolveChatMediaSrc(url) {
    const s = String(url || '');
    if (/^(data|blob|https?):/i.test(s)) return s;
    return s ? apiUrl(s) : '';
}

function shallowPartsEqual(a, b) {
    const aa = a || [];
    const bb = b || [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
        if (aa[i]?.type !== bb[i]?.type || aa[i]?.text !== bb[i]?.text || aa[i]?.url !== bb[i]?.url) {
            return false;
        }
    }
    return true;
}

const MessageBubble = React.memo(({ msg }) => {
    const isMe = msg.senderRole === 'user';
    const isToolResult = msg.senderRole === 'toolResult';
    const isPending = !!msg.pending;

    const formatNum = (n) => n > 1000 ? (n/1000).toFixed(1) + 'k' : n;
    /** Include seconds for latency debugging (CM OpenClaw Chat vs wall clock). */
    const timestampStr = new Date(msg.date * 1000).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    let stamp = `${timestampStr}`;
    if (msg.metrics) {
        const input = formatNum(msg.metrics.input || 0);
        const output = formatNum(msg.metrics.output || 0);
        const cache = formatNum(msg.metrics.cacheRead || 0);
        stamp += ` ↑${input} ↓${output} R${cache}`;
    }
    if (msg.model) {
        stamp += ` ctx ${msg.model}`;
    }
    if (isPending) {
        stamp += ' • sending…';
    }

    // Tool-result messages get a dedicated collapsed-accordion bubble so
    // exec output / log dumps don't flood the transcript.
    if (isToolResult) {
        return <ToolResultBubble msg={msg} stamp={stamp} />;
    }

    const toolCalls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
    const imageParts = (msg.parts || []).filter((p) => p.type === 'image');
    const textFromParts = (msg.parts || [])
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join('\n');
    const sourceText = textFromParts || msg.text || '';
    // Hide the inline `⚙️ [Tool Call: ...]` markers the backend emits in
    // the flattened text; we render toolCalls as chips instead. Also
    // suppress bubbles that would render as empty (no text, no images, no chips).
    const cleanedText = stripToolCallMarkers(sourceText);
    if (!cleanedText && toolCalls.length === 0 && imageParts.length === 0) return null;

    const copyToClipboard = async (text) => {
        try {
            await copyTextToClipboard(text);
        } catch (err) {
            console.warn('[ChatPanel] Copy failed:', err);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px', marginLeft: isMe ? 0 : '8px', marginRight: isMe ? '8px' : 0, fontWeight: 600 }}>
                {msg.sender.replace(' (Gateway)', '')} {msg.isBot && <span style={{ background: ACCENT, color: '#000', padding: '1px 4px', borderRadius: '4px', fontSize: '8px', marginLeft: '4px', fontWeight: 'bold' }}>BOT</span>}
            </div>
            <div style={{ 
                background: BUBBLE_BG,
                color: BUBBLE_TEXT,
                border: isMe ? `1px solid ${ACCENT}` : '1px solid rgba(255,255,255,0.1)',
                boxSizing: 'border-box',
                opacity: isPending ? 0.72 : 1,
                padding: cleanedText || imageParts.length ? '10px 14px 36px 14px' : '8px 14px',
                borderRadius: '8px',
                borderBottomRightRadius: isMe ? 0 : '8px',
                borderBottomLeftRadius: isMe ? '8px' : 0,
                maxWidth: '85%',
                wordBreak: 'break-word',
                fontSize: '10pt',
                lineHeight: '1.45',
                position: 'relative'
            }}>
                {imageParts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: cleanedText ? '10px' : 0 }}>
                        {imageParts.map((part, idx) => {
                            const src = resolveChatMediaSrc(part.url);
                            return src ? (
                                <button
                                    key={`${part.mediaId || idx}`}
                                    type="button"
                                    onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
                                    style={{
                                        padding: 0,
                                        margin: 0,
                                        border: 'none',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        maxWidth: '100%'
                                    }}
                                    title="Bild vergrößern"
                                >
                                    <img
                                        src={src}
                                        alt={part.alt || 'Chat image'}
                                        style={{
                                            display: 'block',
                                            maxWidth: '100%',
                                            maxHeight: '280px',
                                            objectFit: 'contain',
                                            borderRadius: '6px'
                                        }}
                                        onError={(ev) => {
                                            ev.currentTarget.style.opacity = '0.35';
                                        }}
                                    />
                                </button>
                            ) : (
                                <div
                                    key={idx}
                                    style={{
                                        fontSize: '11px',
                                        color: '#888',
                                        border: `1px dashed ${FENCED_BORDER}`,
                                        padding: '8px',
                                        borderRadius: '6px'
                                    }}
                                >
                                    Bild (keine Vorschau-URL)
                                </div>
                            );
                        })}
                    </div>
                )}
                {cleanedText && (
                    <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 2 }}>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(cleanedText)}
                            style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: `1px solid ${isMe ? 'rgba(80,227,194,0.35)' : 'rgba(255,255,255,0.12)'}`,
                                color: '#a8b0c4',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title="Copy as markdown"
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                )}
                {cleanedText && (
                    <div style={{ paddingRight: '8px' }}>
                        {/* Skip ReactMarkdown for plain text to prevent UI blocking */}
                        {/[*_`#\[\]\(\)!]/.test(cleanedText) ? (
                            <ReactMarkdown remarkPlugins={RENDER_PLUGINS} components={RENDER_COMPONENTS}>
                                {cleanedText}
                            </ReactMarkdown>
                        ) : (
                            <span style={{ whiteSpace: 'pre-wrap', color: BUBBLE_TEXT }}>{cleanedText}</span>
                        )}
                    </div>
                )}
                {toolCalls.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: cleanedText || imageParts.length ? '8px' : 0 }}>
                        {toolCalls.map((call, i) => (
                            <ToolCallChip key={call.id || `${call.name}-${i}`} call={call} />
                        ))}
                    </div>
                )}
            </div>
            <div style={{ fontSize: '9px', color: '#666', marginTop: '3px', marginLeft: isMe ? 0 : '8px', marginRight: isMe ? '8px' : 0 }}>
                {stamp}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.msg.id === nextProps.msg.id &&
        prevProps.msg.text === nextProps.msg.text &&
        prevProps.msg.pending === nextProps.msg.pending &&
        shallowPartsEqual(prevProps.msg.parts, nextProps.msg.parts) &&
        (prevProps.msg.toolCalls?.length || 0) === (nextProps.msg.toolCalls?.length || 0) &&
        (prevProps.msg.toolResults?.length || 0) === (nextProps.msg.toolResults?.length || 0)
    );
});

/** Render-only OpenClaw chat mirror; session + SSE live in `useChatSession`. */
export default function ChatPanel({
    channelId,
    channelName,
    configuredModel = '',
    modelOptions = [],
    onConfiguredModelChange = null
}) {
    const {
        messages,
        sessionBinding,
        sessionBindingError,
        runtimeBinding,
        runtimeBindingError,
        workerRuns,
        workerRunsError,
        lastSendMeta,
        isSending,
        isRunningWorker,
        isForcingCanonical,
        sendMessage,
        sendMedia,
        runWorker,
        forceCanonicalSession
    } = useChatSession(channelId);

    const [inputValue, setInputValue] = useState('');
    const [showSystemMessages, setShowSystemMessages] = useState(false);
    const [pasteHint, setPasteHint] = useState(null);
    const [pendingImage, setPendingImage] = useState(null);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');

    const containerRef = useRef(null);
    const messagesInnerRef = useRef(null);
    const stuckToBottomRef = useRef(true);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!channelId) return;
        stuckToBottomRef.current = true;
        setPendingImage(null);
        setSelectedWorkerId('');
    }, [channelId]);

    // OPTIMIZED: useMemo to prevent recalculation on every render
    // CRITICAL: Limit to last 100 messages to prevent UI blocking
    const filteredMessages = useMemo(() => {
        const recentMessages = messages.slice(-100);
        return recentMessages
            .filter(msg => {
                if (showSystemMessages) return true;

                const text = msg.text || '';
                if (text === 'HEARTBEAT_OK') return false;
                if (text.startsWith('Read HEARTBEAT.md')) return false;
                if (isUntrustedSystemNoiseStatic(text)) return false;

                return true;
            })
            .map((msg) => {
                const displayChatText = cleanMessageTextStatic(msg.text || '', showSystemMessages);
                const parts = Array.isArray(msg.parts)
                    ? msg.parts.map((p) =>
                          p?.type === 'text' && typeof p.text === 'string'
                              ? { ...p, text: cleanMessageTextStatic(p.text, showSystemMessages) }
                              : p
                      )
                    : msg.parts;
                return { ...msg, displayChatText, parts };
            })
            // Keep the bubble when any of: there's readable text, we're in
            // "show system" mode, or it carries structured tool data that
            // MessageBubble renders on its own (chips / collapsed output).
            .filter(msg =>
                msg.displayChatText.length > 0 ||
                showSystemMessages ||
                (msg.toolCalls?.length || 0) > 0 ||
                (msg.toolResults?.length || 0) > 0 ||
                (msg.parts || []).some((p) => p.type === 'image')
            );
    }, [messages, showSystemMessages]);

    const modelLabelById = useMemo(() => {
        const entries = (modelOptions || []).map((model) => [model.id, model.name || model.id]);
        return new Map(entries);
    }, [modelOptions]);

    const configuredModelLabel = configuredModel
        ? (modelLabelById.get(configuredModel) || configuredModel)
        : 'Inherit default';
    const liveModel =
        [...messages]
            .reverse()
            .find((msg) => msg.model && !isFailedAttemptAssistantModel(msg))?.model || '';
    const liveModelMatchesConfigured =
        liveModel &&
        configuredModel &&
        normalizeModelForCompare(liveModel) === normalizeModelForCompare(configuredModel);

    const sessionHints = sessionBinding?.openClawSessionHints || null;
    const gatewayModelId = compositeModelIdFromHints(sessionHints);
    const gatewayModelLabel = gatewayModelId
        ? modelLabelById.get(gatewayModelId) || gatewayModelId
        : '';
    const sessionUserOverrideActive = sessionHints?.modelOverrideSource === 'user';
    const sessionOverrideDetail = sessionUserOverrideActive
        ? [sessionHints.providerOverride, sessionHints.modelOverride].filter(Boolean).join(' / ') ||
          '(see sessions.json)'
        : '';
    const gatewayMatchesConfigured =
        gatewayModelId &&
        configuredModel &&
        normalizeModelForCompare(gatewayModelId) === normalizeModelForCompare(configuredModel);
    const transcriptDiffersFromGateway =
        Boolean(liveModel && gatewayModelId) &&
        normalizeModelForCompare(liveModel) !== normalizeModelForCompare(gatewayModelId);
    const showTranscriptBadge =
        Boolean(liveModel) &&
        (!gatewayModelId || transcriptDiffersFromGateway);
    const transcriptModelLabel = liveModel ? modelLabelById.get(liveModel) || liveModel : '';
    const channelRuntimeBinding = runtimeBinding?.channelRuntimeBinding || null;
    const runtimeAlignment = runtimeBinding?.alignment || null;
    const runtimeResolvedSession = runtimeBinding?.resolvedSession || null;
    const runtimeStatus = runtimeAlignment?.status || 'unknown';
    const runtimeMismatch = runtimeStatus === 'mismatch';
    const runtimeUnknown = runtimeStatus === 'unknown';
    const cmTargetLabel = channelRuntimeBinding
        ? `${channelRuntimeBinding.displayName} / ${channelRuntimeBinding.agentId}`
        : '';
    const expectedRuntimeSession = runtimeAlignment?.expectedSessionKey || '';
    const actualRuntimeSession = runtimeAlignment?.actualSessionKey || runtimeResolvedSession?.logicalSessionId || '';
    const transcriptSource =
        runtimeResolvedSession?.storageSessionFile ||
        sessionBinding?.sessionFile ||
        channelRuntimeBinding?.canonicalSession?.expectedTranscriptFile ||
        '';
    const runtimeWorkers = channelRuntimeBinding?.workerPolicy?.runtimeWorkers || [];
    const activeWorkerId =
        selectedWorkerId && runtimeWorkers.some((w) => w.id === selectedWorkerId)
            ? selectedWorkerId
            : runtimeWorkers[0]?.id || '';
    const recentWorkerRuns = Array.isArray(workerRuns) ? workerRuns.slice(0, 3) : [];

    // Within this distance of the bottom we consider the user "pinned" and
    // safe to auto-scroll on new messages. Anything larger → user is
    // reading history and we leave their scroll position alone.
    const SCROLL_PIN_THRESHOLD_PX = 80;

    /** Force the scroll container to the bottom. This is intentionally the
     *  dumbest possible implementation: setting scrollTop directly, no
     *  scrollIntoView, no sentinel, no RAF dance. Called from the
     *  MutationObserver below every time the message list mutates. */
    const forceScrollToBottom = () => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    };

    const handleContainerScroll = () => {
        const el = containerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
        // Our own forceScrollToBottom sets scrollTop exactly to scrollHeight,
        // so the resulting scroll event naturally leaves distanceFromBottom
        // at 0 and keeps the pin on — no suppress window needed.
        stuckToBottomRef.current = distanceFromBottom <= SCROLL_PIN_THRESHOLD_PX;
    };

    // MutationObserver-driven auto-scroll. Any DOM change inside the
    // messages wrapper — a new bubble appended, a code block finishing
    // its markdown render, a tool-output <pre> expanding — fires the
    // observer and we re-pin to the bottom if the user hasn't scrolled
    // away. This covers every scenario the RAF / ResizeObserver combo
    // kept missing because it observes the actual element that grows
    // rather than the fixed-size scroll container. Cheap: the callback
    // is a single `scrollTop = scrollHeight` assignment.
    useEffect(() => {
        const inner = messagesInnerRef.current;
        if (!inner || typeof MutationObserver === 'undefined') return;
        const mo = new MutationObserver(() => {
            if (stuckToBottomRef.current) forceScrollToBottom();
        });
        mo.observe(inner, {
            childList: true,
            subtree: true,
            characterData: true
        });
        return () => mo.disconnect();
    }, []);

    // Also re-pin whenever the visible count changes, for the case where
    // the MutationObserver hasn't attached yet (first mount) or the new
    // content is rendered synchronously within a single React commit
    // (both observers land after, but we want the user bubble to slot
    // in at the bottom immediately on send).
    useEffect(() => {
        if (stuckToBottomRef.current) forceScrollToBottom();
    }, [filteredMessages.length]);

    const handleSendMessage = async () => {
        const textToSend = inputValue.trim();
        if ((!textToSend && !pendingImage) || isSending) return;

        console.log(
            '[ChatPanel] Sending:',
            pendingImage ? '[media]' : textToSend.substring(0, 50),
            'Session:',
            sessionBinding?.sessionId ? 'YES' : 'NO'
        );

        if (pendingImage) {
            const cap = textToSend;
            const img = pendingImage;
            setInputValue('');
            setPendingImage(null);
            const result = await sendMedia({ text: cap, image: img });
            if (!result.ok) {
                console.error(result.error);
                const hint = result.error?.message ? String(result.error.message) : '';
                alert(
                    hint
                        ? `Bild konnte nicht gesendet werden:\n\n${hint}`
                        : 'Bild konnte nicht gesendet werden (Gateway nötig, max. 5 MB, PNG/JPEG/WebP/GIF).'
                );
                setPendingImage(img);
                setInputValue(cap);
            }
            return;
        }

        setInputValue('');

        const result = await sendMessage(textToSend);
        if (!result.ok) {
            console.error(result.error);
            const hint = result.error?.message ? String(result.error.message) : '';
            alert(hint ? `Senden fehlgeschlagen:\n\n${hint}` : 'Failed to send message.');
            setInputValue(textToSend);
        }
    };

    const handleForceCanonicalSession = async () => {
        const result = await forceCanonicalSession?.();
        if (!result?.ok) {
            const hint = result?.error?.message ? String(result.error.message) : '';
            alert(hint ? `Canonical Session konnte nicht erzwungen werden:\n\n${hint}` : 'Canonical Session konnte nicht erzwungen werden.');
        }
    };

    const handleRunWorker = async () => {
        const task = inputValue.trim();
        if (!activeWorkerId || !task || isRunningWorker) return;
        const result = await runWorker?.({ workerId: activeWorkerId, task });
        if (!result?.ok) {
            const hint = result?.error?.message ? String(result.error.message) : '';
            alert(hint ? `Worker Run fehlgeschlagen:\n\n${hint}` : 'Worker Run fehlgeschlagen.');
            return;
        }
        setInputValue('');
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                const f = items[i].getAsFile();
                if (f) {
                    fileToImagePayload(f)
                        .then(setPendingImage)
                        .catch((err) => {
                            const msg = err?.message === 'image_too_large'
                                ? 'Bild ist zu groß (max. 5 MB).'
                                : 'Bild aus der Zwischenablage konnte nicht gelesen werden (nur PNG/JPEG/WebP/GIF).';
                            setPasteHint(msg);
                            window.setTimeout(() => setPasteHint(null), 6000);
                        });
                }
                return;
            }
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div style={{
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            background: '#13141c', 
            color: '#fff',
            height: '100%',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', background: '#1a1b26', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <span style={{ color: '#50e3c2' }}>#</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{channelName}</span>
                    <select
                        value={configuredModel || ''}
                        onChange={(e) => onConfiguredModelChange?.(e.target.value)}
                        disabled={!onConfiguredModelChange}
                        title={`Configured model: ${configuredModelLabel}`}
                        style={{
                            minWidth: '220px',
                            maxWidth: '320px',
                            height: '28px',
                            background: '#13141c',
                            border: '1px solid rgba(80,227,194,0.35)',
                            color: '#dfe6f3',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '12px',
                            fontWeight: 500
                        }}
                    >
                        <option value="">Inherit workspace default</option>
                        {(modelOptions || []).map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.name || model.id}
                            </option>
                        ))}
                    </select>
                    {gatewayModelId && (
                        <span
                            title={
                                (sessionUserOverrideActive
                                    ? `User session override in OpenClaw (${sessionOverrideDetail}). ` +
                                      'The dropdown is the Channel Manager row — it may not match until you clear overrides in sessions.json or use /model.\n\n'
                                    : 'Last resolved OpenClaw session routing (from sessions.json — what the gateway tends to use).\n\n') +
                                `Composite id: ${gatewayModelId}`
                            }
                            style={{
                                fontSize: '11px',
                                color: gatewayMatchesConfigured ? '#9ff0dc' : '#7ec8ff',
                                background: sessionUserOverrideActive
                                    ? 'rgba(255,120,90,0.12)'
                                    : gatewayMatchesConfigured
                                      ? 'rgba(80,227,194,0.10)'
                                      : 'rgba(100,180,255,0.10)',
                                border: `1px solid ${
                                    sessionUserOverrideActive
                                        ? 'rgba(255,140,100,0.35)'
                                        : gatewayMatchesConfigured
                                          ? 'rgba(80,227,194,0.25)'
                                          : 'rgba(120,180,255,0.28)'
                                }`,
                                borderRadius: '4px',
                                padding: '3px 6px',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Gateway · {gatewayModelLabel}
                            {sessionUserOverrideActive ? ' · user' : ''}
                        </span>
                    )}
                    {showTranscriptBadge && (
                        <span
                            title={
                                'Older or different model tag on a mirrored assistant line (JSONL). ' +
                                'Shown only when it disagrees with Gateway, or when no session hints exist. Raw: ' +
                                liveModel
                            }
                            style={{
                                fontSize: '11px',
                                color: liveModelMatchesConfigured ? '#9ff0dc' : '#ffd38a',
                                background: liveModelMatchesConfigured ? 'rgba(80,227,194,0.10)' : 'rgba(255,190,90,0.12)',
                                border: `1px solid ${liveModelMatchesConfigured ? 'rgba(80,227,194,0.25)' : 'rgba(255,190,90,0.25)'}`,
                                borderRadius: '4px',
                                padding: '3px 6px',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Transcript · {transcriptModelLabel}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888', cursor: 'pointer', userSelect: 'none' }}>
                        <input 
                            type="checkbox" 
                            checked={showSystemMessages} 
                            onChange={() => setShowSystemMessages(!showSystemMessages)} 
                        />
                        Show System/Agent Internal Tasks
                    </label>
                    {(channelRuntimeBinding || sessionBinding?.sessionKey) && (
                        <div
                            title={cmTargetLabel ? `CM Target: ${cmTargetLabel}` : 'Channel Manager target'}
                            style={{ fontSize: '11px', color: '#9ff0dc', background: 'rgba(80,227,194,0.10)', padding: '2px 6px', borderRadius: '4px' }}
                        >
                            CM target
                        </div>
                    )}
                    {(actualRuntimeSession || sessionBinding?.sessionKey) && (
                        <div
                            title={
                                [
                                    `Gateway session: ${actualRuntimeSession || sessionBinding?.sessionKey}`,
                                    expectedRuntimeSession ? `Expected canonical: ${expectedRuntimeSession}` : '',
                                    runtimeAlignment?.reasons?.length
                                        ? `Reasons: ${runtimeAlignment.reasons.join(', ')}`
                                        : ''
                                ].filter(Boolean).join('\n')
                            }
                            style={{
                                fontSize: '11px',
                                color: runtimeMismatch ? '#ffcf8a' : runtimeUnknown ? '#c4cad4' : '#50e3c2',
                                background: runtimeMismatch
                                    ? 'rgba(255,190,90,0.12)'
                                    : runtimeUnknown
                                      ? 'rgba(255,255,255,0.06)'
                                      : 'rgba(80,227,194,0.10)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                            }}
                        >
                            Gateway session · {runtimeStatus}
                        </div>
                    )}
                    {transcriptSource && (
                        <div
                            title={transcriptSource}
                            style={{ fontSize: '11px', color: '#8fb3ff', background: 'rgba(80,120,255,0.12)', padding: '2px 6px', borderRadius: '4px' }}
                        >
                            Transcript source
                        </div>
                    )}
                    <div style={{ fontSize: '11px', color: sessionBinding?.sessionId ? '#50e3c2' : '#e0a030', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                        {sessionBinding?.sessionId ? 'SESSION-NATIVE SEND READY' : 'LEGACY FALLBACK ACTIVE'}
                    </div>
                    {lastSendMeta?.transport && (
                        <div style={{ fontSize: '11px', color: '#666', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                            last send {lastSendMeta.transport}
                        </div>
                    )}
                    {sessionBindingError && (
                        <div style={{ fontSize: '11px', color: '#ff8f8f', background: 'rgba(255,80,80,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            {sessionBindingError}
                        </div>
                    )}
                    {runtimeBindingError && (
                        <div style={{ fontSize: '11px', color: '#ff8f8f', background: 'rgba(255,80,80,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            {runtimeBindingError}
                        </div>
                    )}
                </div>
            </div>
            {runtimeMismatch && (
                <div
                    style={{
                        borderBottom: '1px solid rgba(255, 190, 90, 0.28)',
                        background: 'rgba(255, 190, 90, 0.10)',
                        color: '#ffddaa',
                        padding: '8px 16px',
                        fontSize: '12px',
                        lineHeight: 1.45
                    }}
                >
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <strong>Session mismatch:</strong> CM expects{' '}
                            <code>{expectedRuntimeSession || 'canonical Telegram session'}</code>, but the
                            resolved gateway session is <code>{actualRuntimeSession || 'unknown'}</code>.
                            Off-canonical sessions are fine for debugging, but they are not the operative
                            Channel Manager path for this channel.
                        </div>
                        <button
                            type="button"
                            onClick={handleForceCanonicalSession}
                            disabled={isForcingCanonical}
                            title="Refresh the canonical sessions.json entry so this Channel Manager row resolves to its Telegram session."
                            style={{
                                flexShrink: 0,
                                background: '#50e3c2',
                                border: '1px solid rgba(80,227,194,0.45)',
                                color: '#061312',
                                borderRadius: '4px',
                                padding: '6px 10px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: isForcingCanonical ? 'wait' : 'pointer',
                                opacity: isForcingCanonical ? 0.7 : 1
                            }}
                        >
                            {isForcingCanonical ? 'Switching...' : 'Switch to canonical'}
                        </button>
                    </div>
                </div>
            )}
            {(runtimeWorkers.length > 0 || recentWorkerRuns.length > 0 || workerRunsError) && (
                <div
                    style={{
                        borderBottom: '1px solid rgba(80,227,194,0.20)',
                        background: 'rgba(80,227,194,0.06)',
                        padding: '8px 16px',
                        fontSize: '12px',
                        color: '#cfeee6'
                    }}
                >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: '#9ff0dc', fontWeight: 700 }}>Runtime Worker</span>
                        {runtimeWorkers.length > 0 ? (
                            <>
                                <select
                                    value={activeWorkerId}
                                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                                    title="Headless Runtime Worker auswählen"
                                    style={{
                                        maxWidth: '260px',
                                        height: '26px',
                                        background: '#13141c',
                                        border: '1px solid rgba(80,227,194,0.35)',
                                        color: '#dfe6f3',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '12px'
                                    }}
                                >
                                    {runtimeWorkers.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.displayName || w.id}
                                        </option>
                                    ))}
                                </select>
                                <span style={{ color: '#8fa6a0' }}>headless · audit/readback · no Telegram binding</span>
                            </>
                        ) : (
                            <span style={{ color: '#8fa6a0' }}>no active Worker Candidate for this channel</span>
                        )}
                        {workerRunsError && <span style={{ color: '#ffb3b3' }}>{workerRunsError}</span>}
                    </div>
                    {recentWorkerRuns.length > 0 && (
                        <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {recentWorkerRuns.map((run) => (
                                <span
                                    key={run.runId}
                                    title={run.workerResultArtifact?.text || run.runId}
                                    style={{
                                        border: '1px solid rgba(80,227,194,0.22)',
                                        background: 'rgba(0,0,0,0.18)',
                                        borderRadius: '4px',
                                        padding: '3px 6px',
                                        color: '#a9d8ce'
                                    }}
                                >
                                    {run.workerId} · {run.status} · {run.runId}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            
            {/* Messages Area. The outer div is the scroll container (fixed
                height via flex: 1); the inner div is what actually grows
                as messages and markdown content stream in and is what the
                ResizeObserver watches. */}
            <div ref={containerRef} onScroll={handleContainerScroll} style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
                <div ref={messagesInnerRef} style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '100%' }}>
                    {filteredMessages.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            Waiting for messages in {channelName}...
                        </div>
                    ) : (
                        filteredMessages.map((msg, idx) => (
                            <MessageBubble key={msg.id || idx} msg={{...msg, text: msg.displayChatText}} />
                        ))
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border-color)', background: '#1a1b26', flexShrink: 0 }}>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        fileToImagePayload(f)
                            .then(setPendingImage)
                            .catch((err) => {
                                const msg = err?.message === 'image_too_large'
                                    ? 'Datei ist zu groß (max. 5 MB).'
                                    : 'Datei konnte nicht gelesen werden (nur PNG/JPEG/WebP/GIF).';
                                setPasteHint(msg);
                                window.setTimeout(() => setPasteHint(null), 6000);
                            });
                    }}
                />
                {pendingImage && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            marginBottom: '10px',
                            padding: '8px',
                            background: 'rgba(0,0,0,0.25)',
                            border: '1px solid rgba(80,227,194,0.25)',
                            borderRadius: '8px'
                        }}
                    >
                        <img
                            src={pendingImage.previewUrl}
                            alt=""
                            style={{
                                maxHeight: '72px',
                                maxWidth: '120px',
                                objectFit: 'contain',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.12)'
                            }}
                        />
                        <div style={{ flex: 1, fontSize: '12px', color: '#a8b0c4', lineHeight: 1.4 }}>
                            Bild anhängen (optional Text als Caption). Wird über den OpenClaw-Gateway geschickt (CLI-Modus: nicht unterstützt).
                        </div>
                        <button
                            type="button"
                            onClick={() => setPendingImage(null)}
                            title="Anhang entfernen"
                            aria-label="Anhang entfernen"
                            style={{
                                background: 'rgba(255,100,100,0.15)',
                                border: '1px solid rgba(255,120,120,0.35)',
                                color: '#ffb3b3',
                                borderRadius: '6px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}
                <div style={{
                    position: 'relative',
                    background: '#13141c',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    minHeight: '120px'
                }}>
                    <textarea
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={`Message ${channelName}… (Shift+Enter Zeilenumbruch)`}
                        disabled={isSending}
                        rows={5}
                        style={{
                            width: '100%',
                            minHeight: '100px',
                            maxHeight: '220px',
                            boxSizing: 'border-box',
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            outline: 'none',
                            padding: runtimeWorkers.length > 0 ? '12px 128px 12px 12px' : '12px 88px 12px 12px',
                            resize: 'vertical',
                            fontSize: '14px',
                            lineHeight: '1.45',
                            fontFamily: 'inherit'
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending}
                        title="Bild wählen"
                        aria-label="Bild wählen"
                        style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '48px',
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#2a2b36',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '6px',
                            color: '#9ff0dc',
                            cursor: isSending ? 'not-allowed' : 'pointer',
                            opacity: isSending ? 0.5 : 1,
                            transition: 'background 0.15s ease'
                        }}
                    >
                        <Paperclip size={16} strokeWidth={2.2} />
                    </button>
                    {runtimeWorkers.length > 0 && (
                        <button
                            type="button"
                            onClick={handleRunWorker}
                            disabled={isRunningWorker || !inputValue.trim() || !activeWorkerId}
                            title="Eingabetext als headless Worker Run aufzeichnen"
                            aria-label="Worker Run starten"
                            style={{
                                position: 'absolute',
                                bottom: '8px',
                                right: '88px',
                                width: '32px',
                                height: '32px',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: inputValue.trim() && activeWorkerId ? 'rgba(80,227,194,0.18)' : '#2a2b36',
                                border: '1px solid rgba(80,227,194,0.35)',
                                borderRadius: '6px',
                                color: inputValue.trim() && activeWorkerId ? '#9ff0dc' : 'var(--text-muted)',
                                cursor: inputValue.trim() && activeWorkerId && !isRunningWorker ? 'pointer' : 'not-allowed',
                                opacity: isRunningWorker ? 0.6 : 1,
                                transition: 'background 0.15s ease'
                            }}
                        >
                            <Wrench size={16} strokeWidth={2.2} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={isSending || (!inputValue.trim() && !pendingImage)}
                        title="Senden (Enter)"
                        aria-label="Senden"
                        style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '8px',
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: (inputValue.trim() || pendingImage) ? '#50e3c2' : '#2a2b36',
                            border: 'none',
                            borderRadius: '6px',
                            color: (inputValue.trim() || pendingImage) ? '#000' : 'var(--text-muted)',
                            cursor: (inputValue.trim() || pendingImage) && !isSending ? 'pointer' : 'not-allowed',
                            transition: 'background 0.15s ease'
                        }}
                    >
                        <Send size={16} strokeWidth={2.5} />
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: '#666', fontSize: '11px' }}>
                    <Image size={12} />
                    <span>Bild: Paste oder Büroklammer · max. 5 MB · Gateway-Send (OPENCLAW_CM_SEND_TRANSPORT=auto/gateway).</span>
                </div>
                {pasteHint && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#e0a030', lineHeight: 1.4 }}>
                        {pasteHint}
                    </div>
                )}
            </div>
        </div>
    );
}
