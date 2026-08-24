import type { AppEnv } from "@autumn/shared";
import { autumnMcpHeaders } from "./headers.js";

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };
export type JsonSchemaObject = { [key: string]: JsonValue };

export type AutumnMcpToolMetadata = {
	description: string;
	inputSchema: JsonSchemaObject;
	name: string;
};

/** Minimal JSON-RPC over streamable HTTP against the Autumn MCP server:
 * mastra's client discards the wire schema JSON and the MCP SDK's deep
 * imports don't resolve in the agent bundle, so this path exists for code
 * that needs the exact tools/list payloads (the direct-tool resolver). */
const openMcpRpcSession = async ({
	appEnv,
	baseUrl,
	token,
}: {
	appEnv: AppEnv;
	baseUrl: string;
	token: string;
}) => {
	const url = new URL("/mcp", baseUrl);
	const headers: Record<string, string> = {
		...autumnMcpHeaders({ appEnv, token }),
		accept: "application/json, text/event-stream",
		"content-type": "application/json",
	};
	let requestId = 0;
	const sendRpc = async (method: string, params: Record<string, unknown>) => {
		requestId += 1;
		const response = await fetch(url, {
			body: JSON.stringify({ id: requestId, jsonrpc: "2.0", method, params }),
			headers,
			method: "POST",
		});
		const sessionId = response.headers.get("mcp-session-id");
		if (sessionId) headers["mcp-session-id"] = sessionId;
		const text = await response.text();
		const payload = text.startsWith("event:")
			? (text
					.split("\n")
					.find((line) => line.startsWith("data:"))
					?.slice(5) ?? "{}")
			: text;
		return payload ? JSON.parse(payload) : {};
	};
	const close = async () => {
		if (!headers["mcp-session-id"]) return;
		await fetch(url, { headers, method: "DELETE" }).catch(() => undefined);
	};
	await sendRpc("initialize", {
		capabilities: {},
		clientInfo: { name: "leaf-direct-tools", version: "1.0.0" },
		protocolVersion: "2025-03-26",
	});
	return { close, sendRpc };
};

type PooledRpcSession = {
	close: () => Promise<void>;
	sendRpc: (
		method: string,
		params: Record<string, unknown>,
	) => Promise<Record<string, unknown> & { error?: unknown; result?: unknown }>;
	inFlight: number;
	lastUsedAt: number;
};

/** Session churn was 3 HTTP round trips per tool call (initialize, call,
 * DELETE) on the agent's hot path — keep sessions alive with a sliding TTL. */
const RPC_SESSION_TTL_MS = 60_000;

const rpcSessionPool = new Map<string, PooledRpcSession>();

const evictStaleRpcSessions = () => {
	const now = Date.now();
	for (const [key, pooled] of rpcSessionPool) {
		if (pooled.inFlight === 0 && now - pooled.lastUsedAt > RPC_SESSION_TTL_MS) {
			rpcSessionPool.delete(key);
			void pooled.close();
		}
	}
};

const dropRpcSession = (key: string) => {
	const pooled = rpcSessionPool.get(key);
	if (!pooled) return;
	rpcSessionPool.delete(key);
	void pooled.close();
};

/** Runs `send` on a pooled session; a transport failure evicts the session and
 * retries once on a fresh one. JSON-RPC app errors are not retried. */
const withPooledRpcSession = async <T>(
	{
		appEnv,
		baseUrl,
		token,
	}: { appEnv: AppEnv; baseUrl: string; token: string },
	send: (sendRpc: PooledRpcSession["sendRpc"]) => Promise<T>,
): Promise<T> => {
	const key = `${baseUrl}:${token}:${appEnv}`;
	evictStaleRpcSessions();

	const attempt = async (): Promise<T> => {
		let pooled = rpcSessionPool.get(key);
		if (!pooled) {
			const session = await openMcpRpcSession({ appEnv, baseUrl, token });
			pooled = { ...session, inFlight: 0, lastUsedAt: Date.now() };
			rpcSessionPool.set(key, pooled);
		}
		pooled.inFlight += 1;
		try {
			return await send(pooled.sendRpc);
		} finally {
			pooled.inFlight -= 1;
			pooled.lastUsedAt = Date.now();
		}
	};

	try {
		return await attempt();
	} catch (error) {
		if (error instanceof McpRpcToolError) throw error;
		dropRpcSession(key);
		return attempt();
	}
};

class McpRpcToolError extends Error {}

export const callAutumnMcpTool = async ({
	args,
	baseUrl,
	env: appEnv,
	token,
	toolName,
}: {
	args: Record<string, unknown>;
	baseUrl: string;
	env: AppEnv;
	token: string;
	toolName: string;
}) => {
	return withPooledRpcSession({ appEnv, baseUrl, token }, async (sendRpc) => {
		const response = await sendRpc("tools/call", {
			arguments: args,
			name: toolName,
		});
		if (response.error) {
			throw new McpRpcToolError(
				`Autumn MCP tools/call failed: ${JSON.stringify(response.error).slice(0, 400)}`,
			);
		}
		return response.result;
	});
};

export const listAutumnMcpTools = async ({
	baseUrl,
	env: appEnv,
	token,
}: {
	baseUrl: string;
	env: AppEnv;
	token: string;
}): Promise<AutumnMcpToolMetadata[]> => {
	return withPooledRpcSession({ appEnv, baseUrl, token }, async (sendRpc) => {
		const listed = await sendRpc("tools/list", {});
		const tools = ((listed.result as { tools?: unknown[] } | undefined)
			?.tools ?? []) as Array<{
			description?: string;
			inputSchema?: JsonSchemaObject;
			name: string;
		}>;
		return tools.map((tool) => ({
			description: tool.description ?? tool.name,
			inputSchema: tool.inputSchema ?? { type: "object" },
			name: tool.name,
		}));
	});
};
