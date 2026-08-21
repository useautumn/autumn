import { type AppEnv, ms } from "@autumn/shared";
import { MCPClient } from "@mastra/mcp";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { createTtlCache } from "../../lib/ttlCache.js";
import { autumnMcpErrorText } from "./errorResult.js";
import { autumnMcpHeaders } from "./headers.js";

type AutumnTool = {
	execute?: (
		args: Record<string, unknown>,
		...rest: unknown[]
	) => Promise<unknown>;
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

type PooledAutumnClient = {
	disconnectRequested: boolean;
	inUse: number;
	mcpClient: ReturnType<typeof createAutumnMcpClient>;
	tools: Record<string, AutumnTool>;
};

const disconnectPooledClient = (pooled: PooledAutumnClient) => {
	pooled.disconnectRequested = true;
	if (pooled.inUse > 0) return;
	void pooled.mcpClient.disconnect().catch(() => undefined);
};

/** One connected client (and its toolset listing) per caller: the previous
 * connect → list → execute → disconnect paid a full MCP handshake per call.
 * Eviction defers disconnect until in-flight executions release the entry. */
const clientPool = createTtlCache<PooledAutumnClient>({
	onEvict: (pooled) => {
		pooled.then(disconnectPooledClient).catch(() => undefined);
	},
	sliding: true,
	ttlMs: ms.minutes(1),
});

const pooledAutumnClient = ({
	appEnv,
	token,
}: {
	appEnv: AppEnv;
	token: string;
}) =>
	clientPool.getOrCreate(`${token}:${appEnv}`, async () => {
		const mcpClient = createAutumnMcpClient({ appEnv, token });
		const { toolsets, errors } = await mcpClient.listToolsetsWithErrors();
		if (Object.keys(errors).length) {
			void mcpClient.disconnect().catch(() => undefined);
			throw new Error(
				`Could not load Autumn MCP tools: ${JSON.stringify(errors)}`,
			);
		}
		return {
			disconnectRequested: false,
			inUse: 0,
			mcpClient,
			tools: (toolsets.autumn ?? {}) as Record<string, AutumnTool>,
		};
	});

export const executeAutumnMcpTool = async ({
	args,
	env: appEnv,
	token,
	toolName,
}: {
	args: Record<string, unknown>;
	env: AppEnv;
	token: string;
	toolName: string;
}) => {
	const pooled = await pooledAutumnClient({ appEnv, token });
	const tool = pooled.tools[toolName.replace(/^autumn_/, "")];
	if (!tool?.execute) throw new Error(`Unknown Autumn MCP tool: ${toolName}`);
	pooled.inUse += 1;
	const startedAt = Date.now();
	try {
		const result = await tool.execute(args);
		const errorText = autumnMcpErrorText(result);
		if (errorText) {
			logger.warn("Autumn MCP tool returned an error result", {
				data: {
					duration_ms: Date.now() - startedAt,
					env: appEnv,
					error: errorText,
					tool: toolName,
				},
				event: "leaf.autumn_mcp_tool_error",
			});
		}
		return result;
	} catch (error) {
		logger.warn("Autumn MCP tool call failed", {
			data: {
				duration_ms: Date.now() - startedAt,
				env: appEnv,
				tool: toolName,
			},
			error,
			event: "leaf.autumn_mcp_tool_failed",
		});
		throw error;
	} finally {
		pooled.inUse -= 1;
		if (pooled.disconnectRequested) disconnectPooledClient(pooled);
	}
};
