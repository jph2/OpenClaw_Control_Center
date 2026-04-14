import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
    {
        name: "sovereign-channel-bridge",
        version: "1.0.0",
    },
    {
        capabilities: {
            resources: {},
            tools: {},
        },
    }
);

// We proxy to the backend API running on the same machine
const API_BASE = process.env.API_BASE_URL || "http://localhost:3000/api";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "config://channels",
                name: "Active Channels Configuration",
                mimeType: "application/json",
                description: "List of all active sovereign channels out of the OpenClaw backend."
            }
        ]
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === "config://channels") {
        try {
            const res = await fetch(`${API_BASE}/channels`);
            const data = res.ok ? await res.json() : { error: "Failed to fetch from backend" };
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
            };
        } catch (err) {
            return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ error: err.message, note: "Backend might be offline" }) }] };
        }
    }

    const configMatch = uri.match(/^config:\/\/(-?\d+)$/);
    if (configMatch) {
        const channelId = configMatch[1];
        try {
            const res = await fetch(`${API_BASE}/channels/${channelId}`);
            const data = res.ok ? await res.json() : { error: "Channel not found" };
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]
            };
        } catch (err) {
            return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ error: err.message }) }] };
        }
    }

    const memoryMatch = uri.match(/^memory:\/\/(-?\d+)$/);
    if (memoryMatch) {
        const channelId = memoryMatch[1];
        try {
            const res = await fetch(`${API_BASE}/channels/${channelId}/transcript`);
            if (!res.ok) throw new Error("Transcript not found");
            const text = await res.text();
            return {
                contents: [{ uri, mimeType: "text/markdown", text }]
            };
        } catch (err) {
            return { contents: [{ uri, mimeType: "text/markdown", text: `# Memory: ${channelId}\n\n*Transcript currently unavailable.*` }] };
        }
    }

    throw new Error("Resource not found");
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "send_telegram_reply",
                description: "Injects a message into the specified Telegram channel.",
                inputSchema: {
                    type: "object",
                    properties: {
                        channel_id: { type: "string", description: "Telegram Channel ID" },
                        message: { type: "string", description: "The message to send" }
                    },
                    required: ["channel_id", "message"]
                }
            },
            {
                name: "change_agent_mode",
                description: "Changes the operating mode of the agent for a specific channel.",
                inputSchema: {
                    type: "object",
                    properties: {
                        channel_id: { type: "string", description: "Telegram Channel ID" },
                        mode: { type: "string", description: "New mode (e.g., 'active', 'passive', 'monitor')" }
                    },
                    required: ["channel_id", "mode"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "send_telegram_reply") {
        try {
            // Proxy an die interne Methode /bot/send (oder wie genau die Route heißt!)
            const res = await fetch(`${API_BASE}/bot/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channelId: args.channel_id, text: args.message })
            });
            return {
                content: [{ type: "text", text: `Successfully sent message to ${args.channel_id}. Status: ${res.status}` }]
            };
        } catch (err) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }

    if (name === "change_agent_mode") {
        try {
            const res = await fetch(`${API_BASE}/channels/${args.channel_id}/mode`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: args.mode })
            });
            return {
                content: [{ type: "text", text: `Successfully changed mode for ${args.channel_id} to ${args.mode}.` }]
            };
        } catch (err) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }

    throw new Error("Tool not found");
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Sovereign Channel Bridge MCP Server running on stdio");
}

run().catch(console.error);
