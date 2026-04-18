import { useState, useEffect, useRef, startTransition } from 'react';
import { apiUrl } from '../utils/apiUrl';

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

        fetch(apiUrl(`/api/chat/${groupId}/session`))
            .then(async (res) => {
                if (!res.ok) throw new Error(`Session resolve failed (${res.status})`);
                return res.json();
            })
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
                        startTransition(() => {
                            setMessages((prev) => {
                                if (prev.find((m) => m.id === parsed.message.id)) return prev;
                                return [...prev, parsed.message];
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
    }, [groupId]);

    const sendMessage = async (text) => {
        const trimmed = String(text || '').trim();
        if (!trimmed || isSending) return { ok: false, error: 'empty_or_busy' };

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
            return { ok: true, data };
        } catch (err) {
            console.error('[useChatSession] sendMessage', err);
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
