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
	const mcp = createAutumnMcpClient({ token, appEnv: env });
	try {
		const { toolsets, errors } = await mcp.listToolsetsWithErrors();
		if (Object.keys(errors).length) {
			throw new Error(
				`Could not load Autumn MCP tools: ${JSON.stringify(errors)}`,
			);
		}
		const tools = (toolsets.autumn ?? {}) as Record<string, AutumnTool>;
		const tool = tools[toolName.replace(/^autumn_/, "")];
		if (!tool?.execute) throw new Error(`Unknown Autumn MCP tool: ${toolName}`);
		return await tool.execute(args);
	} finally {
		await mcp.disconnect();
	}
};
