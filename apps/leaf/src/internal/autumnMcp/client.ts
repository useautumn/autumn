import { isSecretKeyPrefix } from "@autumn/auth";
import type { AppEnv } from "@autumn/shared";
import { MCPClient } from "@mastra/mcp";
import { env } from "../../lib/env.js";

type AutumnTool = {
	execute?: (
		args: Record<string, unknown>,
		...rest: unknown[]
	) => Promise<unknown>;
};

export const autumnMcpHeaders = ({
	appEnv,
	token,
}: {
	appEnv: AppEnv;
	token: string;
}) => {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"x-autumn-environment": appEnv,
	};
	if (isSecretKeyPrefix({ token })) {
		headers["secret-key"] = token;
	}
	return headers;
};

const withAuthFetch =
	({ appEnv, token }: { appEnv: AppEnv; token: string }) =>
	(input: RequestInfo | URL, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		for (const [name, value] of Object.entries(
			autumnMcpHeaders({ appEnv, token }),
		)) {
			headers.set(name, value);
		}
		return fetch(input, { ...init, headers });
	};

export const createAutumnMcpClient = ({
	token,
	appEnv,
	options = {},
}: {
	token: string;
	appEnv: AppEnv;
	options?: { requireApproval?: boolean };
}) => {
	const fetchWithAuth = withAuthFetch({ appEnv, token });
	const headers = autumnMcpHeaders({ appEnv, token });

	return new MCPClient({
		id: `autumn-${token.slice(0, 14)}`,
		servers: {
			autumn: {
				url: new URL("/mcp", env.LOCAL_MCP_URL),
				requestInit: { headers },
				eventSourceInit: { fetch: fetchWithAuth },
				fetch: fetchWithAuth,
				requireToolApproval: options.requireApproval
					? ({ annotations }) => annotations?.destructiveHint === true
					: false,
			},
		},
	});
};

const CLIENT_POOL_TTL_MS = 60_000;
type PooledAutumnClient = {
	expiresAt: number;
	tools: Promise<Record<string, AutumnTool>>;
	mcp: ReturnType<typeof createAutumnMcpClient>;
};
const clientPool = new Map<string, PooledAutumnClient>();

const evictExpiredClients = () => {
	const now = Date.now();
	for (const [key, pooled] of clientPool) {
		if (pooled.expiresAt > now) continue;
		clientPool.delete(key);
		void pooled.mcp.disconnect().catch(() => undefined);
	}
};

/** One connected client (and its toolset listing) per caller: the previous
 * connect → list → execute → disconnect per call paid a full MCP handshake
 * every time — several per approval card. */
const pooledAutumnTools = ({
	appEnv,
	token,
}: {
	appEnv: AppEnv;
	token: string;
}) => {
	evictExpiredClients();
	const key = `${token}:${appEnv}`;
	const cached = clientPool.get(key);
	if (cached) {
		cached.expiresAt = Date.now() + CLIENT_POOL_TTL_MS;
		return cached.tools;
	}
	const mcp = createAutumnMcpClient({ token, appEnv });
	const tools = (async () => {
		const { toolsets, errors } = await mcp.listToolsetsWithErrors();
		if (Object.keys(errors).length) {
			throw new Error(
				`Could not load Autumn MCP tools: ${JSON.stringify(errors)}`,
			);
		}
		return (toolsets.autumn ?? {}) as Record<string, AutumnTool>;
	})();
	clientPool.set(key, {
		expiresAt: Date.now() + CLIENT_POOL_TTL_MS,
		mcp,
		tools,
	});
	tools.catch(() => {
		clientPool.delete(key);
		void mcp.disconnect().catch(() => undefined);
	});
	return tools;
};

export const executeAutumnMcpTool = async ({
	env,
	token,
	toolName,
	args,
}: {
	env: AppEnv;
	token: string;
	toolName: string;
	args: Record<string, unknown>;
}) => {
	const tools = await pooledAutumnTools({ appEnv: env, token });
	const tool = tools[toolName.replace(/^autumn_/, "")];
	if (!tool?.execute) throw new Error(`Unknown Autumn MCP tool: ${toolName}`);
	return await tool.execute(args);
};

export type AutumnMcpToolMetadata = {
	description: string;
	inputSchema: Record<string, unknown>;
	name: string;
};

/** Lists the server's tools with their wire schemas — the same shapes a
 * connection_search discovery would return. Plain JSON-RPC over streamable
 * HTTP: mastra's client discards the schema JSON and the MCP SDK's deep
 * imports are unresolvable here. */
const mcpRpcSession = async ({
	baseUrl,
	appEnv,
	token,
}: {
	appEnv: AppEnv;
	baseUrl?: string;
	token: string;
}) => {
	const url = new URL("/mcp", baseUrl ?? env.LOCAL_MCP_URL);
	const headers: Record<string, string> = {
		accept: "application/json, text/event-stream",
		authorization: `Bearer ${token}`,
		"content-type": "application/json",
		"x-autumn-environment": appEnv,
	};
	const rpc = async (body: Record<string, unknown>) => {
		const response = await fetch(url, {
			body: JSON.stringify(body),
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
	await rpc({
		id: 1,
		jsonrpc: "2.0",
		method: "initialize",
		params: {
			capabilities: {},
			clientInfo: { name: "leaf-direct-tools", version: "1.0.0" },
			protocolVersion: "2025-03-26",
		},
	});
	return rpc;
};

/** Calls one server tool over raw JSON-RPC — the direct-tool execute path,
 * which cannot rely on env.LOCAL_MCP_URL (it may run inside the eve server
 * process, whose PORT is its own). */
export const callAutumnMcpTool = async ({
	args,
	baseUrl,
	env: appEnv,
	token,
	toolName,
}: {
	args: Record<string, unknown>;
	baseUrl?: string;
	env: AppEnv;
	token: string;
	toolName: string;
}) => {
	const rpc = await mcpRpcSession({ appEnv, baseUrl, token });
	const response = await rpc({
		id: 2,
		jsonrpc: "2.0",
		method: "tools/call",
		params: { arguments: args, name: toolName },
	});
	if (response.error) {
		throw new Error(
			`Autumn MCP tools/call failed: ${JSON.stringify(response.error).slice(0, 400)}`,
		);
	}
	return response.result;
};

export const listAutumnMcpTools = async ({
	baseUrl,
	env: appEnv,
	token,
}: {
	baseUrl?: string;
	env: AppEnv;
	token: string;
}): Promise<AutumnMcpToolMetadata[]> => {
	const rpc = await mcpRpcSession({ appEnv, baseUrl, token });
	const listed = await rpc({
		id: 2,
		jsonrpc: "2.0",
		method: "tools/list",
		params: {},
	});
	const tools = (listed.result?.tools ?? []) as Array<{
		description?: string;
		inputSchema?: Record<string, unknown>;
		name: string;
	}>;
	return tools.map((tool) => ({
		description: tool.description ?? tool.name,
		inputSchema: tool.inputSchema ?? { type: "object" },
		name: tool.name,
	}));
};
