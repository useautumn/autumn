import { createHash } from "node:crypto";
import { RequestContext } from "@mastra/core/request-context";
import type { ToolExecutionContext } from "@mastra/core/tools";
import type { OAuthEnvironment } from "../oauth.js";

export type AutumnMcpAuth = {
	apiKey: string;
	env: OAuthEnvironment;
	principalId: string;
	resource: string;
	scopes: string[];
	orgId?: string | undefined;
	serverURL?: string | undefined;
	xApiVersion?: string | undefined;
	failOpen?: boolean | undefined;
};

type MaybeToolContext = Pick<ToolExecutionContext, "mcp" | "requestContext">;

const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);

export const principalFromSecret = (kind: string, value: string) =>
	`${kind}:${hash(value)}`;

export const createAutumnClient = (auth: AutumnMcpAuth) => ({
	baseUrl: auth.serverURL ?? "https://api.useautumn.com",
	headers: {
		Authorization: `Bearer ${auth.apiKey}`,
		"Content-Type": "application/json",
		Accept: "application/json",
		"x-api-version": auth.xApiVersion ?? "2.3.0",
		...(auth.failOpen === undefined
			? {}
			: { "fail-open": String(auth.failOpen) }),
	},
});

export const getAutumnAuth = (context?: MaybeToolContext): AutumnMcpAuth => {
	const direct = context?.mcp?.extra?.authInfo as AutumnMcpAuth | undefined;
	const nested = context?.requestContext?.get?.("mcp.extra") as
		| { authInfo?: AutumnMcpAuth }
		| undefined;
	const auth = direct ?? nested?.authInfo;
	if (!auth?.apiKey) throw new Error("Autumn MCP authentication is required.");
	return auth;
};

export const createRequestContext = (auth: AutumnMcpAuth) => {
	const requestContext = new RequestContext();
	requestContext.set("mcp.extra", { authInfo: auth });
	return requestContext;
};
