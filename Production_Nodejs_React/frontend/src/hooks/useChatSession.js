import { useState, useEffect, useRef, startTransition } from 'react';
import { apiUrl } from '../utils/apiUrl';

function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Mirrored user lines from OpenClaw often prefix what the human typed with
 * e.g. `[Mon 2026-04-20 17:56 GMT+2] ` — optimistic bubbles store only the typed text.
 * Strip stacked `[...] ` prefixes so we can match and remove the placeholder.
 */
function mirrorUserTextForOptimisticMatch(text) {
    let s = String(text || '').trim();
    for (let i = 0; i < 4; i++) {
        const m = s.match(/^\[[^\]]*\]\s*/);
        if (!m) break;
        s = s.slice(m[0].length).trim();
    }
    return s.replace(/\s+/g, ' ').trim();
}

function removeMatchedOptimisticMessages(currentMessages, incomingMessages) {
    const incoming = incomingMessages || [];
    const incomingUserTexts = new Set(
        incoming
            .filter((m) => m?.senderRole === 'user' && typeof m.text === 'string')
            .map((m) => mirrorUserTextForOptimisticMatch(m.text))
            .filter(Boolean)
    );

    return currentMessages.filter((m) => {
        if (!m.cmOptimistic) return true;

        if (m.cmAttachKind === 'image') {
            const matched = incoming.some((inc) => {
                if (inc?.senderRole !== 'user' || inc.cmAttachKind !== 'image') return false;
                const a = mirrorUserTextForOptimisticMatch(m.text);
                const b = mirrorUserTextForOptimisticMatch(inc.text);
                return a === b;
            });
            return !matched;
        }

        const normalized = mirrorUserTextForOptimisticMatch(m.text);
        if (!normalized) return true;
        return !incomingUserTexts.has(normalized);
    });
}

/**
 * Turn a non-OK fetch into an Error with best-effort body text (JSON `message` or short text).
 * @param {Response} res
 */
async function throwIfResNotOk(res) {
    if (res.ok) return;
    let detail = `${res.status} ${res.statusText || ''}`.trim();
    try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            const j = await res.json();
            if (j && typeof j.message === 'string' && j.message) detail = j.message;
        } else {
            const t = await res.text();
            if (t && t.length < 600) detail = t;
        }
    } catch {
        /* keep detail */
    }
    const err = new Error(detail || 'Request failed');
    err.status = res.status;
    throw err;
}

/** Few retries when the browser hits transient connection limits or the Vite proxy blips. */
async function fetchSessionJson(groupId, maxAttempts = 4) {
    let lastErr = null;
    const groupKey = encodeURIComponent(String(groupId));
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(apiUrl(`/api/chat/${groupKey}/session`));
            if (!res.ok) throw new Error(`Session resolve failed (${res.status})`);
            return await res.json();
        } catch (e) {
            lastErr = e;
            if (attempt < maxAttempts) await delay(200 * 2 ** (attempt - 1));
        }
    }
    throw lastErr;
}

async function fetchRuntimeBindingJson(groupId, maxAttempts = 4) {
    let lastErr = null;
    const groupKey = encodeURIComponent(String(groupId));
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(apiUrl(`/api/chat/${groupKey}/runtime-binding`));
            if (!res.ok) throw new Error(`Runtime binding resolve failed (${res.status})`);
            return await res.json();
        } catch (e) {
            lastErr = e;
            if (attempt < maxAttempts) await delay(200 * 2 ** (attempt - 1));
        }
    }
    throw lastErr;
}

/**
 * Session resolve + SSE mirror + send for one Telegram group (Channel Manager chat panel).
 * @param {string|number|undefined} groupId — Telegram channel id (or alias resolved server-side).
 */
export function useChatSession(groupId) {
    const [messages, setMessages] = useState([]);
    const [sessionBinding, setSessionBinding] = useState(null);
    const [sessionBindingError, setSessionBindingError] = useState(null);
    const [runtimeBinding, setRuntimeBinding] = useState(null);
    const [runtimeBindingError, setRuntimeBindingError] = useState(null);
    const [lastSendMeta, setLastSendMeta] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const [isForcingCanonical, setIsForcingCanonical] = useState(false);

    const sseFailStreakRef = useRef(0);

    useEffect(() => {
        if (!groupId) {
            setSessionBinding(null);
            setSessionBindingError(null);
            setRuntimeBinding(null);
            setRuntimeBindingError(null);
            return;
        }

        let cancelled = false;

        fetchSessionJson(groupId)
            .then((data) => {
                if (cancelled) return;
                setSessionBinding(data);
                setSessionBindingError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[useChatSession] Session resolve error:', err);
                setSessionBinding(null);
                setSessionBindingError(err.message || 'Session resolve failed');
                setLastSendMeta(null);
            });

        fetchRuntimeBindingJson(groupId)
            .then((data) => {
                if (cancelled) return;
                setRuntimeBinding(data);
                setRuntimeBindingError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[useChatSession] Runtime binding resolve error:', err);
                setRuntimeBinding(null);
                setRuntimeBindingError(err.message || 'Runtime binding resolve failed');
            });

        return () => {
            cancelled = true;
        };
    }, [groupId]);

    useEffect(() => {
        if (!groupId) return;

        let cancelled = false;

        sseFailStreakRef.current = 0;

        let shouldReconnect = true;
        let eventSource = null;
        let reconnectTimer = null;

        const connectSSE = () => {
            eventSource = new EventSource(apiUrl(`/api/chat/${groupId}/stream`));

            eventSource.onopen = () => {
                sseFailStreakRef.current = 0;
            };

            eventSource.onmessage = (event) => {
                if (event.data === ':ping') return;
                try {
                    const parsed = JSON.parse(event.data);
                    if (parsed.type === 'INIT' || parsed.type === 'SESSION_REBOUND') {
                        if (!cancelled) {
                            Promise.allSettled([
                                fetchSessionJson(groupId),
                                fetchRuntimeBindingJson(groupId)
                            ]).then(([sessionResult, bindingResult]) => {
                                if (cancelled) return;
                                if (sessionResult.status === 'fulfilled') {
                                    setSessionBinding(sessionResult.value);
                                    setSessionBindingError(null);
                                } else {
                                    console.warn(
                                        '[useChatSession] Session resolve refresh failed:',
                                        sessionResult.reason?.message || sessionResult.reason
                                    );
                                }
                                if (bindingResult.status === 'fulfilled') {
                                    setRuntimeBinding(bindingResult.value);
                                    setRuntimeBindingError(null);
                                } else {
                                    console.warn(
                                        '[useChatSession] Runtime binding refresh failed:',
                                        bindingResult.reason?.message || bindingResult.reason
                                    );
                                }
                            });
                        }
                        const incoming = parsed.messages || [];
                        startTransition(() =>
                            setMessages((prev) => [
                                ...removeMatchedOptimisticMessages(prev, incoming),
                                ...incoming.filter((msg) => !prev.some((m) => m.id === msg.id))
                            ])
                        );
                    } else if (parsed.type === 'MESSAGE') {
                        const incomingMsg = parsed.message;
                        startTransition(() => {
                            setMessages((prev) => {
                                let base = prev;
                                /* Drop optimistic bubble once the mirrored user line arrives from JSONL. */
                                if (
                                    incomingMsg &&
                                    incomingMsg.senderRole === 'user' &&
                                    typeof incomingMsg.text === 'string'
                                ) {
                                    base = removeMatchedOptimisticMessages(prev, [incomingMsg]);
                                }
                                if (base.find((m) => m.id === incomingMsg.id)) return base;
                                return [...base, incomingMsg];
                            });
                        });
                    }
                } catch (e) {
                    console.warn('[useChatSession] Failed to parse SSE payload', e);
                }
            };

            eventSource.onerror = () => {
                const es = eventSource;
                if (es) es.close();
                if (!shouldReconnect) return;

                sseFailStreakRef.current += 1;
                const n = sseFailStreakRef.current;
                if (n === 1 || n % 5 === 0) {
                    console.warn(
                        `[Telegram SSE] stream ${groupId}: connection dropped (attempt ${n}, will reconnect). ` +
                            'Often: API restart / tab background — or **too many OpenClaw Chat tabs** (browser ~6 connections/host); ' +
                            'only one row should use Chat at a time.'
                    );
                }

                const delayMs = Math.min(2500 * 1.4 ** Math.min(n - 1, 8), 20000);
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connectSSE, delayMs);
            };
        };

        connectSSE();

        return () => {
            cancelled = true;
            shouldReconnect = false;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            if (eventSource) eventSource.close();
        };
    }, [groupId]);

    const sendMessage = async (text) => {
        const trimmed = String(text || '').trim();
        if (!trimmed || isSending) return { ok: false, error: 'empty_or_busy' };

        const optimisticId = `cm-opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const optimisticMsg = {
            id: optimisticId,
            text: trimmed,
            sender: 'User (Telegram)',
            senderRole: 'user',
            senderId: 'user',
            date: Math.floor(Date.now() / 1000),
            isBot: false,
            pending: true,
            cmOptimistic: true
        };
        /* Urgent: show the bubble immediately; CM mirror + CLI lag behind Telegram-native path. */
        setMessages((prev) => [...prev, optimisticMsg]);

        setIsSending(true);
        try {
            const resolved = sessionBinding;
            let res;

            if (resolved?.sessionId) {
                res = await fetch(apiUrl(`/api/chat/session/${resolved.sessionId}/send`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: trimmed,
                        sessionKey: resolved.sessionKey
                    })
                });
            } else {
                res = await fetch(apiUrl(`/api/chat/${groupId}/send`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: trimmed })
                });
            }

            await throwIfResNotOk(res);
            const data = await res.json();
            setLastSendMeta(data);
            setMessages((prev) =>
                prev.map((m) => (m.id === optimisticId ? { ...m, pending: false } : m))
            );
            return { ok: true, data };
        } catch (err) {
            console.error('[useChatSession] sendMessage', err);
            setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
            return { ok: false, error: err };
        } finally {
            setIsSending(false);
        }
    };

    const forceCanonicalSession = async () => {
        if (!groupId || isForcingCanonical) return { ok: false, error: 'missing_or_busy' };
        const groupKey = encodeURIComponent(String(groupId));
        setIsForcingCanonical(true);
        try {
            const res = await fetch(apiUrl(`/api/chat/${groupKey}/force-canonical-session`), {
                method: 'POST'
            });
            await throwIfResNotOk(res);
            const data = await res.json();
            setRuntimeBinding(data);
            setRuntimeBindingError(null);

            const expectedSessionKey = data?.alignment?.expectedSessionKey;
            if (expectedSessionKey) {
                const session = await fetchSessionJson(expectedSessionKey);
                setSessionBinding(session);
                setSessionBindingError(null);
            }
            return { ok: true, data };
        } catch (err) {
            console.error('[useChatSession] forceCanonicalSession', err);
            setRuntimeBindingError(err.message || 'Force canonical session failed');
            return { ok: false, error: err };
        } finally {
            setIsForcingCanonical(false);
        }
    };

    /**
     * Send one image (+ optional caption) via gateway-native chat.send attachments.
     * @param {{ text?: string, image: { base64: string, mimeType: string, filename?: string, previewUrl?: string } }} payload
     */
    const sendMedia = async (payload) => {
        const img = payload?.image;
        const cap = String(payload?.text || '').trim();
        if (!img?.base64 || !img?.mimeType || isSending) return { ok: false, error: 'bad_image_or_busy' };

        const optimisticId = `cm-opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const parts = [];
        if (cap) parts.push({ type: 'text', text: cap });
        parts.push({
            type: 'image',
            mediaId: 'pending',
            mimeType: String(img.mimeType).split(';')[0].trim(),
            url: img.previewUrl || undefined
        });

        const optimisticMsg = {
            id: optimisticId,
            text: cap,
            parts,
            sender: 'User (Telegram)',
            senderRole: 'user',
            senderId: 'user',
            date: Math.floor(Date.now() / 1000),
            isBot: false,
            pending: true,
            cmOptimistic: true,
            cmAttachKind: 'image'
        };
        setMessages((prev) => [...prev, optimisticMsg]);

        setIsSending(true);
        try {
            const resolved = sessionBinding;
            let res;

            const body = {
                text: cap,
                image: {
                    mimeType: img.mimeType,
                    base64: img.base64,
                    filename: img.filename
                }
            };

            if (resolved?.sessionId) {
                res = await fetch(apiUrl(`/api/chat/session/${resolved.sessionId}/send-media`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: cap,
                        sessionKey: resolved.sessionKey,
                        image: body.image
                    })
                });
            } else {
                res = await fetch(apiUrl(`/api/chat/${groupId}/send-media`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }

            await throwIfResNotOk(res);
            const data = await res.json();
            setLastSendMeta(data);
            setMessages((prev) =>
                prev.map((m) => (m.id === optimisticId ? { ...m, pending: false } : m))
            );
            return { ok: true, data };
        } catch (err) {
            console.error('[useChatSession] sendMedia', err);
            setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
            return { ok: false, error: err };
        } finally {
            setIsSending(false);
        }
    };

    return {
        messages,
        sessionBinding,
        sessionBindingError,
        runtimeBinding,
        runtimeBindingError,
        lastSendMeta,
        isSending,
        isForcingCanonical,
        sendMessage,
        sendMedia,
        forceCanonicalSession
    };
}
