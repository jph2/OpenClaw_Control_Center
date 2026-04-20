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
        const m = s.match(/^\[[^\]]*]\s*/);
        if (!m) break;
        s = s.slice(m[0].length).trim();
    }
    return s;
}

/** Few retries when the browser hits transient connection limits or the Vite proxy blips. */
async function fetchSessionJson(groupId, maxAttempts = 4) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(apiUrl(`/api/chat/${groupId}/session`));
            if (!res.ok) throw new Error(`Session resolve failed (${res.status})`);
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
    const [lastSendMeta, setLastSendMeta] = useState(null);
    const [isSending, setIsSending] = useState(false);

    const sseFailStreakRef = useRef(0);

    useEffect(() => {
        if (!groupId) {
            setSessionBinding(null);
            setSessionBindingError(null);
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

        return () => {
            cancelled = true;
        };
    }, [groupId]);

    useEffect(() => {
        if (!groupId) return;

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
                        const incoming = parsed.messages || [];
                        startTransition(() => setMessages(incoming));
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
                                    const normalizedIn = mirrorUserTextForOptimisticMatch(incomingMsg.text);
                                    if (
                                        normalizedIn &&
                                        prev.some(
                                            (m) =>
                                                m.cmOptimistic &&
                                                String(m.text || '').trim() === normalizedIn
                                        )
                                    ) {
                                        base = prev.filter(
                                            (m) =>
                                                !(
                                                    m.cmOptimistic &&
                                                    String(m.text || '').trim() === normalizedIn
                                                )
                                        );
                                    }
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

            if (!res.ok) throw new Error('Send failed');
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

    return {
        messages,
        sessionBinding,
        sessionBindingError,
        lastSendMeta,
        isSending,
        sendMessage
    };
}
