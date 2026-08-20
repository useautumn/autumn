import { isSecretKeyPrefix } from "@autumn/auth";
import { type AppEnv, ms } from "@autumn/shared";
import { MCPClient } from "@mastra/mcp";
import { env } from "../../lib/env.js";
import { createTtlCache } from "../../lib/ttlCache.js";

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
	env,
	token,
	toolName,
}: {
	args: Record<string, unknown>;
	env: AppEnv;
	token: string;
	toolName: string;
}) => {
	const pooled = await pooledAutumnClient({ appEnv: env, token });
	const tool = pooled.tools[toolName.replace(/^autumn_/, "")];
	if (!tool?.execute) throw new Error(`Unknown Autumn MCP tool: ${toolName}`);
	pooled.inUse += 1;
	try {
		return await tool.execute(args);
	} finally {
		pooled.inUse -= 1;
		if (pooled.disconnectRequested) disconnectPooledClient(pooled);
	}
};
