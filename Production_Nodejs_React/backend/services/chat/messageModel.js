/**
 * Flatten a single OpenClaw content block into a plain string, for the
 * collapsed text payload of a tool result bubble. The gateway sometimes
 * nests the actual output under `content[]` (text blocks only for now).
 */
function flattenToolResultContent(block) {
    if (!block) return '';
    if (typeof block.content === 'string') return block.content;
    if (Array.isArray(block.content)) {
        return block.content
            .map((inner) => {
                if (inner?.type === 'text' && typeof inner.text === 'string') return inner.text;
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    if (typeof block.text === 'string') return block.text;
    return '';
}

export function buildMsgObjFromGatewayLine(parsed) {
    if (!parsed || parsed.type !== 'message' || !parsed.message) return null;
    const data = parsed;
    const role = data.message.role;
    const contentBlocks = data.message.content || [];
    let text = '';
    const toolCalls = [];
    const toolResults = [];
    contentBlocks.forEach((b) => {
        if (b.type === 'text') {
            text += b.text + '\n';
        } else if (b.type === 'toolCall') {
            toolCalls.push({
                id: b.id || null,
                name: b.name || 'tool',
                input: b.input ?? b.arguments ?? b.args ?? null
            });
        } else if (b.type === 'toolResult') {
            toolResults.push({
                id: b.id || null,
                toolUseId: b.toolUseId || null,
                toolName: b.toolName || 'tool',
                output: flattenToolResultContent(b),
                isError: b.isError === true
            });
        }
    });
    text = text.trim();
    if (!text && toolCalls.length === 0 && toolResults.length === 0) return null;
    return {
        id: data.id || `gen_${Math.random()}`,
        text,
        toolCalls,
        toolResults,
        sender: role === 'assistant' ? 'TARS (Engine)' : role === 'toolResult' ? 'System (Tool)' : 'User (Telegram)',
        senderId: role,
        senderRole: role,
        date: Math.floor(new Date(data.timestamp || Date.now()).getTime() / 1000),
        isBot: role === 'assistant' || role === 'toolResult',
        metrics: data.message.usage || null,
        model: data.message.model || ''
    };
}
