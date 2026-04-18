/**
 * Facade for the chat mirror stack (Bundle B / P5). Implementation lives under ./chat/.
 */
import { hydrateChannelAliasesFromDiskSync, normalizeChatIdForBuffer } from './chat/channelAliases.js';
import { telegramEvents } from './chat/chatEvents.js';
import { getMessagesForChat } from './chat/chatMirrorState.js';
import {
    hydrateOpenclawSessionIndex,
    resolveCanonicalSession,
    refreshChatMirrorFromCanonicalSession,
    startSessionsJsonWatcher,
    defaultSessionsJsonPath
} from './chat/sessionIndex.js';
import { reconcileWatchedSessionFiles, getWatchedSessionFilesCount } from './chat/sessionTail.js';
import { sendMessageToChat } from './chat/sessionSender.js';

export {
    telegramEvents,
    normalizeChatIdForBuffer,
    getMessagesForChat,
    sendMessageToChat,
    refreshChatMirrorFromCanonicalSession,
    resolveCanonicalSession
};

export function initTelegramService() {
    hydrateChannelAliasesFromDiskSync();

    const sessionsJsonPath = defaultSessionsJsonPath();

    try {
        hydrateOpenclawSessionIndex();
        reconcileWatchedSessionFiles();

        startSessionsJsonWatcher(sessionsJsonPath, () => {
            hydrateOpenclawSessionIndex();
            reconcileWatchedSessionFiles();
        });

        console.log(
            `[TelegramService] Watching ${sessionsJsonPath} plus ${getWatchedSessionFilesCount()} canonical session file(s).`
        );
        console.log('[TelegramService] Phase 7 Gateway Listener active. Bridging session transcripts to React SSE.');
    } catch (err) {
        console.error('[TelegramService] Initialization failed:', err.message);
    }
}
