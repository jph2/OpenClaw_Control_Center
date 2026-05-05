import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', 
            justifyContent: 'center', minHeight: '100vh', padding: '40px 20px',
            textAlign: 'center'
        }}>
            <div style={{
                width: '80px', height: '80px', background: 'var(--accent)',
                borderRadius: '20px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 24px',
                boxShadow: '0 0 40px rgba(80, 227, 194, 0.2)'
            }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--bg-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
            </div>
            
            <h1 style={{ fontSize: '2.5rem', marginBottom: '12px', fontWeight: '700', letterSpacing: '-0.02em', color: '#fff'}}>OpenClaw UI Extensions</h1>
            <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '40px', maxWidth: '600px', margin: '0 auto 40px', lineHeight: '1.6'}}>
                Modular, high-performance interfaces tailored specifically for OpenUSD and the OpenClaw Agent ecosystem.
            </p>
            
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '20px', width: '100%', maxWidth: '1100px'
            }}>
                {/* Node 1: Workbench */}
                <Link to="/workbench" style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                    borderRadius: '16px', padding: '32px 24px', textDecoration: 'none',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative', overflow: 'hidden'
                }} 
                onMouseOver={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
                }}
                onMouseOut={e => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                }}>
                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📂</div>
                    <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '8px' }}>Workbench MVP</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>Advanced Split-pane filesystem tree viewer and Universal Markdown/Code editor.</p>
                </Link>

                {/* Node 2: Channel Manager */}
                <Link to="/channels" style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                    borderRadius: '16px', padding: '32px 24px', textDecoration: 'none',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative', overflow: 'hidden'
                }}
                onMouseOver={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
                }}
                onMouseOut={e => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                }}>
                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>💬</div>
                    <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '8px' }}>Channel Manager</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>Manage Agentic Channel mappings, active Skill Roles, and cross-platform syncing.</p>
                </Link>

                {/* Node 3: Documentation */}
                <Link to="/docs" style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                    borderRadius: '16px', padding: '32px 24px', textDecoration: 'none',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative', overflow: 'hidden'
                }}
                onMouseOver={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
                }}
                onMouseOut={e => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                }}>
                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📖</div>
                    <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '8px' }}>Documentation</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>What the Workbench and Channel Manager do, how to use them, and how they connect.</p>
                </Link>
            </div>
            
            <div style={{ marginTop: '60px', color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></span>
                System Core Online
            </div>
        </div>
    );
}
