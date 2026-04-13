import React, { useState, useEffect, useRef } from 'react';

export default function TelegramChat({ channelId, channelName }) {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Setup Server-Sent Events for live messages
    useEffect(() => {
        if (!channelId) return;
        
        let shouldReconnect = true;
        let eventSource = null;
        
        const connectSSE = () => {
             eventSource = new EventSource(`/api/telegram/stream/${channelId}`);
             
             eventSource.onmessage = (event) => {
                 if (event.data === ':ping') return;
                 try {
                     const parsed = JSON.parse(event.data);
                     if (parsed.type === 'INIT') {
                         setMessages(parsed.messages);
                     } else if (parsed.type === 'MESSAGE') {
                         setMessages(prev => {
                             // Avoid duplicates if SSE reconnects
                             if (prev.find(m => m.id === parsed.message.id)) return prev;
                             return [...prev, parsed.message];
                         });
                     }
                 } catch (e) {
                     console.warn('Failed to parse SSE payload', e);
                 }
             };
             
             eventSource.onerror = (e) => {
                 console.warn("SSE connection error", e);
                 eventSource.close();
                 if (shouldReconnect) {
                     setTimeout(connectSSE, 3000);
                 }
             };
        };

        connectSSE();

        return () => {
            shouldReconnect = false;
            if (eventSource) eventSource.close();
        };
    }, [channelId]);

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
            // Optimistic update is not strictly needed because the bot will broadcast it back via SSE
            // Actually, bots don't receive their own outgoing messages natively via telegraf unless specified,
            // but let's see. If not, we can push an optimistic message. For safety, let's push an optimistic one:
            setMessages(prev => [...prev, { id: Date.now(), text: textToSend, sender: 'You (Frontend)', senderId: 'me', date: Date.now()/1000, isBot: false }]);
        } catch (err) {
            console.error(err);
            alert("Failed to send message.");
            setInputValue(textToSend); // restore on fail
        } finally {
            setIsSending(false);
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
                <div style={{ fontSize: '11px', color: '#666', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                    NATIVE CLIENT
                </div>
            </div>
            
            {/* Messages Area */}
            <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                {messages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Waiting for messages in {channelName}...
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isMe = msg.senderId === 'me';
                        return (
                            <div key={msg.id || idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', marginLeft: isMe ? 0 : '8px', marginRight: isMe ? '8px' : 0 }}>
                                    {msg.sender} {msg.isBot && <span style={{ background: '#50e3c2', color: '#000', padding: '1px 4px', borderRadius: '4px', fontSize: '9px', marginLeft: '4px' }}>BOT</span>}
                                </div>
                                <div style={{ 
                                    background: isMe ? '#50e3c2' : '#2a2b36', 
                                    color: isMe ? '#000' : '#fff',
                                    padding: '8px 12px', 
                                    borderRadius: '8px',
                                    borderBottomRightRadius: isMe ? 0 : '8px',
                                    borderBottomLeftRadius: isMe ? '8px' : 0,
                                    maxWidth: '85%',
                                    wordBreak: 'break-word',
                                    lineHeight: '1.4'
                                }}>
                                    {msg.text}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: '#1a1b26' }}>
                <div style={{ display: 'flex', background: '#13141c', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 12px', alignItems: 'center' }}>
                    <input 
                        type="text" 
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSendMessage(); }}
                        placeholder={`Message ${channelName}...`}
                        disabled={isSending}
                        style={{
                            flex: 1, background: 'transparent', border: 'none', 
                            color: '#fff', outline: 'none', padding: '4px'
                        }} 
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={isSending || !inputValue.trim()} 
                        style={{ 
                            background: inputValue.trim() ? '#50e3c2' : '#2a2b36', 
                            border: 'none',
                            color: inputValue.trim() ? '#000' : 'var(--text-muted)', 
                            padding: '6px 14px', borderRadius: '4px', cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold', fontSize: '13px', marginLeft: '8px', transition: 'all 0.2s'
                        }}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
