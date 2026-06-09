import { RequestContext } from "@mastra/core/request-context";
import * as z from "zod/v4";
import {
	DEFAULT_API_VERSION,
	DEFAULT_AUTUMN_API_URL,
} from "../../constants.js";

export const environmentSchema = z.enum(["sandbox", "live"]);
export type OAuthEnvironment = z.infer<typeof environmentSchema>;

/**
 * Authenticated Autumn identity attached to every MCP request. Defined as a zod
 * schema so the same definition both types the value and validates it when read
 * back from the (loosely-typed) MCP execution context — no casts required.
 */
export const autumnMcpAuthSchema = z.object({
	apiKey: z.string().min(1),
	authMethod: z.enum(["secret-key", "oauth"]).optional(),
	env: environmentSchema,
	principalId: z.string(),
	resource: z.string(),
	scopes: z.array(z.string()),
	orgId: z.string().optional(),
	serverURL: z.string().optional(),
	xApiVersion: z.string().optional(),
	failOpen: z.boolean().optional(),
});

export type AutumnMcpAuth = z.infer<typeof autumnMcpAuthSchema>;

/**
 * Minimal structural view of the MCP tool execution context we read auth from.
 * Kept intentionally loose so any Mastra `ToolExecutionContext` satisfies it
 * without callers having to cast.
 */
type AuthContext = {
	mcp?: { extra?: { authInfo?: unknown } | undefined } | undefined;
	requestContext?: { get?: (key: string) => unknown } | undefined;
};

/** Reads `mcp.extra.authInfo` back out of a serialized request context. */
const readNestedAuthInfo = (
	requestContext: AuthContext["requestContext"],
): unknown => {
	const extra = requestContext?.get?.("mcp.extra");
	if (typeof extra === "object" && extra !== null && "authInfo" in extra) {
		return extra.authInfo;
	}
	return undefined;
};

export const getAutumnAuth = (context?: AuthContext): AutumnMcpAuth => {
	const candidate =
		context?.mcp?.extra?.authInfo ??
		readNestedAuthInfo(context?.requestContext);

	const parsed = autumnMcpAuthSchema.safeParse(candidate);
	if (!parsed.success) {
		throw new Error("Autumn MCP authentication is required.");
	}
	return parsed.data;
};

export const createRequestContext = (auth: AutumnMcpAuth) => {
	const requestContext = new RequestContext();
	requestContext.set("mcp.extra", { authInfo: auth });
	return requestContext;
};

export const createAutumnClient = (auth: AutumnMcpAuth) => ({
	baseUrl: auth.serverURL ?? DEFAULT_AUTUMN_API_URL,
	headers: {
		Authorization: `Bearer ${auth.apiKey}`,
		"Content-Type": "application/json",
		Accept: "application/json",
		"x-api-version": auth.xApiVersion ?? DEFAULT_API_VERSION,
		"x-autumn-environment": auth.env,
		...(auth.authMethod === "oauth"
			? { "x-autumn-oauth-resource": auth.resource }
			: {}),
		...(auth.failOpen === undefined
			? {}
			: { "fail-open": String(auth.failOpen) }),
	},
});
