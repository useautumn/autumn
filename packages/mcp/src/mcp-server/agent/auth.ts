import { createHash } from "node:crypto";
import { RequestContext } from "@mastra/core/request-context";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { ms } from "@autumn/shared/unixUtils";
import { addMilliseconds, isFuture } from "date-fns";
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

const orgCache = new Map<string, { orgId: string; expiresAt: Date }>();

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

export const resolveAutumnOrgId = async (auth: AutumnMcpAuth) => {
	if (auth.orgId) return auth.orgId;

	const cacheKey = [
		auth.serverURL ?? "https://api.useautumn.com",
		auth.env,
		hash(auth.apiKey),
		auth.xApiVersion ?? "2.3.0",
		String(auth.failOpen),
	].join(":");
	const cached = orgCache.get(cacheKey);
	if (cached && isFuture(cached.expiresAt)) return cached.orgId;

	const client = createAutumnClient(auth);
	const response = await fetch(new URL("/v1/organization", client.baseUrl), {
		method: "GET",
		headers: client.headers,
	});
	if (!response.ok) {
		throw new Error("Could not resolve Autumn organization for MCP request.");
	}

	const body = (await response.json()) as { id?: unknown };
	if (typeof body.id !== "string" || !body.id) {
		throw new Error("Autumn organization response did not include an id.");
	}

	orgCache.set(cacheKey, {
		orgId: body.id,
		expiresAt: addMilliseconds(new Date(), ms.minutes(5)),
	});

	return body.id;
};

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
