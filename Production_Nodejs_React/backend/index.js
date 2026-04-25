import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

// ============================================================================
// PHASE 0: PRE-FLIGHT CHECKS & FAIL-SAFES
// ============================================================================
if (!process.env.WORKSPACE_ROOT) {
    console.error('================================================================');
    console.error('FATAL ERROR: WORKSPACE_ROOT environment variable is missing.');
    console.error('Never run this server without an explicitly defined WORKSPACE_ROOT.');
    console.error('This acts as a global fail-safe against Traversal Attacks exposing process.cwd() or /.');
    console.error('Please copy .env.example to .env and configure it before starting.');
    console.error('================================================================');
    process.exit(1);
}

// Ensure it's an absolute path
if (!process.env.WORKSPACE_ROOT.startsWith('/')) { // Simplistic check for posix, will refine in path.resolve logic
    console.error('FATAL ERROR: WORKSPACE_ROOT must be an absolute path.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// PHASE 1: BACKEND FOUNDATION & SECURITY GATES (Base Layers)
// ============================================================================

// Standard Security & Utility Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'OpenClaw Unified Backend is running.' });
});

// G5: Global Sanitized Error Handler (Mask Stack Traces in Production)
import channelRoutes from './routes/channels.js';
import workbenchRoutes from './routes/workbench.js';
import chatRoutes from './routes/chat.js';
import telegramRoutes from './routes/telegram.js';
import openclawRoutes from './routes/openclaw.js';
import summariesRoutes from './routes/summaries.js';
import exportsRoutes from './routes/exports.js';
import { initTelegramService } from './services/telegramService.js';

app.use('/api/channels', channelRoutes);
app.use('/api/workbench', workbenchRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/openclaw', openclawRoutes);
app.use('/api/summaries', summariesRoutes);
app.use('/api/ide-project-summaries', summariesRoutes);
app.use('/api/exports', exportsRoutes);

// Sub-Task 3.1: Initialize Telegram Event Stream
if (process.env.NODE_ENV !== 'test') {
    initTelegramService();
}

app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.name}: ${err.message}`);
    
    // Do not leak stack traces unless explicitly in dev mode
    const isDev = process.env.NODE_ENV === 'development';
    
    res.status(err.status || 500).json({
        error: true,
        message: isDev ? err.message : 'Internal Server Error'
    });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`OpenClaw Unified API listening on http://0.0.0.0:${PORT}`);
        console.log(`Locked to WORKSPACE_ROOT: ${process.env.WORKSPACE_ROOT}`);
    });
}

export default app;
