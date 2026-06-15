import type { AppEnv } from "@autumn/shared";
import type { NetworkPolicy } from "@vercel/sandbox";
import { autumnMcpHeaders } from "../../internal/autumnMcp/client.js";
import { env as chatEnv } from "../../lib/env.js";

type DomainRules = Array<{
	transform?: Array<{ headers?: Record<string, string> }>;
}>;

/**
 * Permissive egress ("*" allows everything) with credential brokering: when a
 * token is given, the firewall injects the Autumn MCP auth headers in transit on
 * the MCP host, so the agent never sees the secret and the proxy overwrites any
 * header it sets. Called without a token (e.g. template prewarm) it's plain allow-all.
 */
export const buildLeafNetworkPolicy = ({
	anthropicApiKey,
	env,
	token,
}: {
	anthropicApiKey?: string;
	env?: AppEnv;
	token?: string;
} = {}): NetworkPolicy => {
	const allow: Record<string, DomainRules> = { "*": [] };
	if (token && env) {
		const mcpHost = new URL(chatEnv.MCP_SERVER_URL).host;
		allow[mcpHost] = [
			{ transform: [{ headers: autumnMcpHeaders({ appEnv: env, token }) }] },
		];
	}
	if (anthropicApiKey) {
		allow["api.anthropic.com"] = [
			{ transform: [{ headers: { "x-api-key": anthropicApiKey } }] },
		];
	}
	return { allow };
};
