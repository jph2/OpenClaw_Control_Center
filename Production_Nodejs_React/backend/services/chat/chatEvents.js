import { EventEmitter } from 'events';

/** SSE + ingest bus for telegram mirror routes. */
export const telegramEvents = new EventEmitter();
