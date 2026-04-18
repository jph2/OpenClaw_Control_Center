import React, { useState, useEffect, useRef, useMemo, startTransition } from 'react';
import { Send, Copy, Image, ChevronRight, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiUrl } from '../utils/apiUrl';

const RENDER_PLUGINS = [remarkGfm];

/** Channel Manager chat — Look & Feel: accent as border/highlight only, not full user-bubble fill */
const ACCENT = '#50e3c2';
const BUBBLE_BG = '#2a2b36';
const BUBBLE_TEXT = '#e0e0e0';
const INLINE_CODE_BORDER = 'rgba(255,255,255,0.14)';
const FENCED_BORDER = 'rgba(255,255,255,0.16)';

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

const MessageBubble = React.memo(({ msg }) => {
    const isMe = msg.senderRole === 'user';
    const isToolResult = msg.senderRole === 'toolResult';
    const isPending = !!msg.pending;

    const formatNum = (n) => n > 1000 ? (n/1000).toFixed(1) + 'k' : n;
    const timestampStr = new Date(msg.date * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
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
    // Hide the inline `⚙️ [Tool Call: ...]` markers the backend emits in
    // the flattened text; we render toolCalls as chips instead. Also
    // suppress bubbles that would render as empty (no text and no chips).
    const cleanedText = stripToolCallMarkers(msg.text);
    if (!cleanedText && toolCalls.length === 0) return null;

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
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
                padding: cleanedText ? '10px 14px 36px 14px' : '8px 14px',
                borderRadius: '8px',
                borderBottomRightRadius: isMe ? 0 : '8px',
                borderBottomLeftRadius: isMe ? '8px' : 0,
                maxWidth: '85%',
                wordBreak: 'break-word',
                fontSize: '10pt',
                lineHeight: '1.45',
                position: 'relative'
            }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: cleanedText ? '8px' : 0 }}>
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
        (prevProps.msg.toolCalls?.length || 0) === (nextProps.msg.toolCalls?.length || 0) &&
        (prevProps.msg.toolResults?.length || 0) === (nextProps.msg.toolResults?.length || 0)
    );
});

export default function TelegramChat({ channelId, channelName }) {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showSystemMessages, setShowSystemMessages] = useState(false);
    const [pasteHint, setPasteHint] = useState(null);
    const [sessionBinding, setSessionBinding] = useState(null);
    const [sessionBindingError, setSessionBindingError] = useState(null);
    const [lastSendMeta, setLastSendMeta] = useState(null);
    // Phase 1: Removed local optimistic append - no pendingMessages state
    // Messages now come exclusively from canonical session stream
    const containerRef = useRef(null);
    /** Sentinel element kept at the end of the messages list; scrolled into
     *  view instead of computing `scrollTop = scrollHeight` manually, so a
     *  late-arriving code block or markdown render doesn't leave the target
     *  above the real bottom. */
    const bottomSentinelRef = useRef(null);
    /** Counts consecutive SSE failures (reset on onopen). Used to throttle console noise — onerror is normal during reconnects. */
    const sseFailStreakRef = useRef(0);
    /**
     * Tracks whether the user's scroll position is anchored near the bottom.
     * Updated on every user-initiated scroll. We auto-scroll on new messages
     * only when this is true, so reading history is never interrupted.
     */
    const stuckToBottomRef = useRef(true);
    /** Set to true right before a programmatic scrollIntoView so the next
     *  onScroll event (fired by the browser as a side-effect of the
     *  scroll itself) doesn't flip stuckToBottomRef to false mid-layout. */
    const suppressNextScrollFlipRef = useRef(false);

    useEffect(() => {
        if (!channelId) {
            setSessionBinding(null);
            setSessionBindingError(null);
            return;
        }

        // New channel → reset the scroll pin so the first INIT lands at bottom
        // even if the user was scrolled up in the previously selected channel.
        stuckToBottomRef.current = true;

        let cancelled = false;

        console.log('[TelegramChat] Resolving session for channel:', channelId);
        fetch(apiUrl(`/api/telegram/session/${channelId}`))
            .then(async (res) => {
                if (!res.ok) throw new Error(`Session resolve failed (${res.status})`);
                return res.json();
            })
            .then((data) => {
                if (cancelled) return;
                console.log('[TelegramChat] Session resolved:', data.sessionId ? 'OK' : 'No session', data);
                setSessionBinding(data);
                setSessionBindingError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[TelegramChat] Session resolve error:', err);
                setSessionBinding(null);
                setSessionBindingError(err.message || 'Session resolve failed');
                setLastSendMeta(null);
            });

        return () => {
            cancelled = true;
        };
    }, [channelId]);

    // Setup Server-Sent Events for live messages
    useEffect(() => {
        if (!channelId) return;

        sseFailStreakRef.current = 0;

        let shouldReconnect = true;
        let eventSource = null;
        let reconnectTimer = null;

        const connectSSE = () => {
            eventSource = new EventSource(apiUrl(`/api/telegram/stream/${channelId}`));

            eventSource.onopen = () => {
                sseFailStreakRef.current = 0;
            };

            eventSource.onmessage = (event) => {
                if (event.data === ':ping') return;
                try {
                    const parsed = JSON.parse(event.data);
                    // Mark SSE-driven state updates as transitions so React
                    // can keep the input responsive during bursts (typing,
                    // button clicks) and coalesce renders when messages
                    // arrive back-to-back.
                    if (parsed.type === 'INIT' || parsed.type === 'SESSION_REBOUND') {
                        const incoming = parsed.messages || [];
                        startTransition(() => setMessages(incoming));
                    } else if (parsed.type === 'MESSAGE') {
                        startTransition(() => {
                            setMessages((prev) => {
                                if (prev.find((m) => m.id === parsed.message.id)) return prev;
                                return [...prev, parsed.message];
                            });
                        });
                    }
                } catch (e) {
                    console.warn('Failed to parse SSE payload', e);
                }
            };

            eventSource.onerror = () => {
                const es = eventSource;
                if (es) es.close();
                if (!shouldReconnect) return;

                sseFailStreakRef.current += 1;
                const n = sseFailStreakRef.current;
                // Browsers fire onerror on every drop; logging each one spams the console when many chats mount.
                if (n === 1 || n % 5 === 0) {
                    console.warn(
                        `[Telegram SSE] stream ${channelId}: connection dropped (attempt ${n}, will reconnect). ` +
                            'Normal if the API restarted or the tab was backgrounded.'
                    );
                }

                const delayMs = Math.min(2500 * 1.4 ** Math.min(n - 1, 8), 20000);
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connectSSE, delayMs);
            };
        };

        connectSSE();

        return () => {
            shouldReconnect = false;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            if (eventSource) eventSource.close();
        };
    }, [channelId]);

    // Use static helpers for better performance

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
            .map(msg => ({
                ...msg,
                displayChatText: cleanMessageTextStatic(msg.text || '', showSystemMessages)
            }))
            // Keep the bubble when any of: there's readable text, we're in
            // "show system" mode, or it carries structured tool data that
            // MessageBubble renders on its own (chips / collapsed output).
            .filter(msg =>
                msg.displayChatText.length > 0 ||
                showSystemMessages ||
                (msg.toolCalls?.length || 0) > 0 ||
                (msg.toolResults?.length || 0) > 0
            );
    }, [messages, showSystemMessages]);

    // Within this distance of the bottom we consider the user "pinned" and
    // safe to auto-scroll on new messages. Anything larger → user is
    // reading history and we leave their scroll position alone.
    const SCROLL_PIN_THRESHOLD_PX = 80;

    const handleContainerScroll = () => {
        if (suppressNextScrollFlipRef.current) {
            // This scroll event was fired by our own scrollIntoView call;
            // don't let it flip the pin state before layout has settled.
            suppressNextScrollFlipRef.current = false;
            return;
        }
        const el = containerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
        stuckToBottomRef.current = distanceFromBottom <= SCROLL_PIN_THRESHOLD_PX;
    };

    /**
     * Scroll the sentinel into view, once the current commit's layout has
     * been painted. A single rAF is usually enough, but ReactMarkdown /
     * fenced code blocks sometimes expand the row during paint — the
     * ResizeObserver below picks up that second growth step.
     */
    const scrollToBottomIfPinned = () => {
        if (!stuckToBottomRef.current) return;
        const sentinel = bottomSentinelRef.current;
        if (!sentinel) return;
        suppressNextScrollFlipRef.current = true;
        sentinel.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
    };

    // Auto-scroll when the *visible* (filtered) count changes, only if
    // the user is anchored near the bottom. rAF defers the scroll until
    // after the browser has laid out the newly-appended bubble, so the
    // sentinel is already at its final position.
    useEffect(() => {
        const raf = requestAnimationFrame(scrollToBottomIfPinned);
        return () => cancelAnimationFrame(raf);
    }, [filteredMessages.length]);

    // Some message content (markdown, fenced code) grows the row *after*
    // the initial paint. Re-assert the scroll pin whenever the container's
    // own scrollHeight changes while the user is still anchored; cheap
    // because chat content rarely resizes when scroll is idle.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            if (stuckToBottomRef.current) scrollToBottomIfPinned();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isSending) return;

        const textToSend = inputValue.trim();
        console.log('[TelegramChat] Sending message:', textToSend.substring(0, 50), 'Session:', sessionBinding?.sessionId ? 'YES' : 'NO');
        setInputValue('');
        setIsSending(true);

        try {
            // Phase 4: Use native OpenClaw session send via HTTP API
            // This eliminates CLI spawn overhead and provides faster ack
            const resolved = sessionBinding;
            let res;

            if (resolved?.sessionId) {
                // Native session send - preferred fast path
                res = await fetch(apiUrl(`/api/openclaw/session/${resolved.sessionId}/send`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: textToSend,
                        sessionKey: resolved.sessionKey
                    })
                });
            } else {
                // Fallback to legacy route
                res = await fetch(apiUrl('/api/telegram/send'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chatId: channelId, text: textToSend })
                });
            }

            if (!res.ok) throw new Error('Send failed');
            const data = await res.json();
            setLastSendMeta(data);
        } catch (err) {
            console.error(err);
            alert("Failed to send message.");
            setInputValue(textToSend); // restore on fail
        } finally {
            setIsSending(false);
        }
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                setPasteHint('Bilder: noch nicht angebunden (API sendet nur Text). Fotos bitte direkt in Telegram oder später: Backend sendPhoto / OpenClaw-Media).');
                window.setTimeout(() => setPasteHint(null), 7000);
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
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#50e3c2' }}>#</span>
                    {channelName}
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
                    {sessionBinding?.sessionKey && (
                        <div style={{ fontSize: '11px', color: '#8fb3ff', background: 'rgba(80,120,255,0.12)', padding: '2px 6px', borderRadius: '4px' }}>
                            session {sessionBinding.sessionKey}
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
                </div>
            </div>
            
            {/* Messages Area */}
            <div ref={containerRef} onScroll={handleContainerScroll} style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                {filteredMessages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Waiting for messages in {channelName}...
                    </div>
                ) : (
                    filteredMessages.map((msg, idx) => (
                        <MessageBubble key={msg.id || idx} msg={{...msg, text: msg.displayChatText}} />
                    ))
                )}
                {/* Bottom sentinel — auto-scroll target. Zero-height so it
                    never grows the container, and aria-hidden so assistive
                    tech doesn't announce an empty element. */}
                <div
                    ref={bottomSentinelRef}
                    aria-hidden="true"
                    style={{ height: 0, flexShrink: 0 }}
                />
            </div>

            {/* Input Area */}
            <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border-color)', background: '#1a1b26', flexShrink: 0 }}>
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
                            padding: '12px 44px 12px 12px',
                            resize: 'vertical',
                            fontSize: '14px',
                            lineHeight: '1.45',
                            fontFamily: 'inherit'
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={isSending || !inputValue.trim()}
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
                            background: inputValue.trim() ? '#50e3c2' : '#2a2b36',
                            border: 'none',
                            borderRadius: '6px',
                            color: inputValue.trim() ? '#000' : 'var(--text-muted)',
                            cursor: inputValue.trim() && !isSending ? 'pointer' : 'not-allowed',
                            transition: 'background 0.15s ease'
                        }}
                    >
                        <Send size={16} strokeWidth={2.5} />
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: '#666', fontSize: '11px' }}>
                    <Image size={12} />
                    <span>Text per Paste ok; Bilder aus der Zwischenablage: noch nicht unterstützt (nur Text-API).</span>
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
