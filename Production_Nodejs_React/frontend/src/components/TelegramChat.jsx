import React, { useState, useEffect, useRef } from 'react';
import { Send, Copy, Image } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const RENDER_PLUGINS = [remarkGfm];

const RENDER_COMPONENTS = {
    p: ({ node: _node, ...props }) => <p style={{ margin: '0 0 10px 0' }} {...props} />,
    pre: ({ node: _node, ...props }) => <pre style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', overflowX: 'auto', margin: '10px 0' }} {...props} />,
    code: ({ node: _node, inline, className, children, ...props }) => inline ? <code style={{ background: 'rgba(0,0,0,0.15)', padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9em' }} {...props}>{children}</code> : <code style={{ fontFamily: 'monospace', fontSize: '0.9em' }} className={className} {...props}>{children}</code>,
    ul: ({ node: _node, ...props }) => <ul style={{ paddingLeft: '24px', marginBottom: '10px', marginTop: '0' }} {...props} />,
    ol: ({ node: _node, ...props }) => <ol style={{ paddingLeft: '24px', marginBottom: '10px', marginTop: '0' }} {...props} />,
    li: ({ node: _node, ...props }) => <li style={{ marginBottom: '4px' }} {...props} />,
    a: ({ node: _node, ...props }) => <a style={{ color: '#50e3c2', textDecoration: 'none' }} {...props} />
};

const MessageBubble = React.memo(({ msg }) => {
    const isMe = msg.senderRole === 'user';
    
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

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', marginLeft: isMe ? 0 : '8px', marginRight: isMe ? '8px' : 0, fontWeight: 600 }}>
                {msg.sender.replace(' (Gateway)', '')} {msg.isBot && <span style={{ background: '#50e3c2', color: '#000', padding: '1px 4px', borderRadius: '4px', fontSize: '9px', marginLeft: '4px', fontWeight: 'bold' }}>BOT</span>}
            </div>
            <div style={{ 
                background: isMe ? '#50e3c2' : '#2a2b36', 
                color: isMe ? '#000' : '#e0e0e0',
                padding: '12px 16px', 
                borderRadius: '8px',
                borderBottomRightRadius: isMe ? 0 : '8px',
                borderBottomLeftRadius: isMe ? '8px' : 0,
                maxWidth: '85%',
                wordBreak: 'break-word',
                lineHeight: '1.5',
                position: 'relative'
            }}>
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                    <button 
                        onClick={() => copyToClipboard(msg.text)}
                        style={{ background: 'rgba(0,0,0,0.1)', border: 'none', color: isMe ? '#000' : '#888', cursor: 'pointer', borderRadius: '4px', padding: '4px', display: 'flex', alignItems: 'center' }}
                        title="Copy as markdown"
                    >
                        <Copy size={14} />
                    </button>
                </div>
                <div style={{ paddingRight: '20px' }}>
                    {/* eslint-disable no-unused-vars */}
                    <ReactMarkdown remarkPlugins={RENDER_PLUGINS} components={RENDER_COMPONENTS}>
                        {msg.text}
                    </ReactMarkdown>
                </div>
            </div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', marginLeft: isMe ? 0 : '8px', marginRight: isMe ? '8px' : 0 }}>
                {stamp}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    return prevProps.msg.id === nextProps.msg.id && prevProps.msg.text === nextProps.msg.text;
});

export default function TelegramChat({ channelId, channelName }) {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showSystemMessages, setShowSystemMessages] = useState(false);
    const [pasteHint, setPasteHint] = useState(null);
    const containerRef = useRef(null);
    /** Counts consecutive SSE failures (reset on onopen). Used to throttle console noise — onerror is normal during reconnects. */
    const sseFailStreakRef = useRef(0);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Setup Server-Sent Events for live messages
    useEffect(() => {
        if (!channelId) return;

        sseFailStreakRef.current = 0;

        let shouldReconnect = true;
        let eventSource = null;
        let reconnectTimer = null;

        const connectSSE = () => {
            eventSource = new EventSource(`/api/telegram/stream/${channelId}`);

            eventSource.onopen = () => {
                sseFailStreakRef.current = 0;
            };

            eventSource.onmessage = (event) => {
                if (event.data === ':ping') return;
                try {
                    const parsed = JSON.parse(event.data);
                    if (parsed.type === 'INIT' || parsed.type === 'SESSION_REBOUND') {
                        setMessages(parsed.messages || []);
                    } else if (parsed.type === 'MESSAGE') {
                        setMessages((prev) => {
                            // Avoid duplicates if SSE reconnects
                            if (prev.find((m) => m.id === parsed.message.id)) return prev;
                            return [...prev, parsed.message];
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

    const cleanMessageText = (text) => {
        if (showSystemMessages) return text;
        
        let cleaned = text;
        // Function 2: Text cleaning
        cleaned = cleaned.replace(/\[\[reply_to_current\]\]\s*/g, '');
        cleaned = cleaned.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```json[\s\S]*?```\s*/g, '');
        cleaned = cleaned.replace(/Sender \(untrusted metadata\):[\s\S]*?```json[\s\S]*?```\s*/g, '');
        
        return cleaned.trim();
    };

    const filteredMessages = messages.filter(msg => {
        if (showSystemMessages) return true;
        
        const text = msg.text || '';
        // Function 1: Block system messages
        if (text === 'HEARTBEAT_OK') return false;
        if (text.startsWith('Read HEARTBEAT.md')) return false;
        
        return true;
    }).map(msg => ({
        ...msg,
        displayChatText: cleanMessageText(msg.text || '')
    })).filter(msg => msg.displayChatText.length > 0 || showSystemMessages);

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isSending) return;
        
        const textToSend = inputValue.trim();
        setInputValue('');
        setIsSending(true);
        
        try {
            const res = await fetch('/api/telegram/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: channelId, text: textToSend })
            });
            if (!res.ok) throw new Error('Send failed');
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#888', cursor: 'pointer', userSelect: 'none' }}>
                        <input 
                            type="checkbox" 
                            checked={showSystemMessages} 
                            onChange={() => setShowSystemMessages(!showSystemMessages)} 
                        />
                        Show System/Agent Internal Tasks
                    </label>
                    <div style={{ fontSize: '11px', color: '#666', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                        NATIVE CLIENT
                    </div>
                </div>
            </div>
            
            {/* Messages Area */}
            <div ref={containerRef} style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                {messages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Waiting for messages in {channelName}...
                    </div>
                ) : (
                    filteredMessages.map((msg, idx) => (
                        <MessageBubble key={msg.id || idx} msg={{...msg, text: msg.displayChatText}} />
                    ))
                )}
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
