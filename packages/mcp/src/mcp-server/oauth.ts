import { type ScopeString, Scopes } from "@autumn/shared/scopeDefinitions";
import { ms } from "@autumn/shared/unixUtils";
import { addMilliseconds, isFuture } from "date-fns";
import * as z from "zod/v4";
import type { AutumnMcpAuth } from "./agent/auth.js";
import { principalFromSecret } from "./agent/auth.js";
import type { ConsoleLogger } from "./console-logger.js";
import type { MCPServerFlags } from "./flags.js";

export const MCP_OAUTH_SCOPES = [
	Scopes.Customers.Read,
	Scopes.Plans.Read,
	Scopes.Billing.Read,
	Scopes.Billing.Write,
	Scopes.Analytics.Read,
] as const satisfies readonly ScopeString[];

const environmentSchema = z.enum(["sandbox", "live"]);
const xApiVersionSchema = z.string().default("2.3.0");
const failOpenSchema = z
	.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
	.default(true);
const secretKeySchema = z.string().min(1).optional();
const tokenExchangeSchema = z.object({
	sandbox_key: z.string().optional(),
	prod_key: z.string().optional(),
	org_id: z.string().optional(),
	user_id: z.string().optional(),
	client_id: z.string().optional(),
	scopes: z.array(z.string()).optional(),
});

export type OAuthEnvironment = z.infer<typeof environmentSchema>;

export interface MCPOAuthFlags extends MCPServerFlags {
	readonly "oauth-enabled"?: boolean | undefined;
	readonly "oauth-environment"?: OAuthEnvironment | undefined;
}

export class OAuthHttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly error = "invalid_token",
		readonly wwwAuthenticate?: string,
	) {
		super(message);
	}
}

const apiKeyCache = new Map<
	string,
	{
		key: string;
		orgId?: string | undefined;
		userId?: string | undefined;
		clientId?: string | undefined;
		scopes?: string[] | undefined;
		expiresAt: Date;
	}
>();

function trimTrailingSlash(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getResourceUrl(
	headers: Headers,
	_flags: MCPOAuthFlags,
	resourcePath = "/mcp",
): string {
	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	if (!host) {
		throw new OAuthHttpError(400, "Missing Host header", "invalid_request");
	}

	const proto = headers.get("x-forwarded-proto") ?? "http";
	return new URL(resourcePath, `${proto}://${host}`).href;
}

export function getProtectedResourceMetadataUrl(resourceUrl: string): string {
	const url = new URL(resourceUrl);
	const path = url.pathname === "/" ? "" : url.pathname;
	return new URL(`/.well-known/oauth-protected-resource${path}`, url).href;
}

function getIssuerUrl(flags: MCPOAuthFlags): string {
	return trimTrailingSlash(
		new URL("/api/auth", flags["server-url"] ?? "https://api.useautumn.com")
			.href,
	);
}

function getApiKeyUrl(flags: MCPOAuthFlags): string {
	return new URL("/cli/api-keys", getIssuerUrl(flags)).href;
}

function getWWWAuthenticate(resourceUrl: string, error?: string): string {
	const params = [
		`resource_metadata="${getProtectedResourceMetadataUrl(resourceUrl)}"`,
	];
	if (error) params.push(`error="${error}"`);
	return `Bearer ${params.join(", ")}`;
}

export function getProtectedResourceMetadata(
	headers: Headers,
	flags: MCPOAuthFlags,
	resourcePath = "/mcp",
) {
	const resource = getResourceUrl(headers, flags, resourcePath);
	return {
		resource,
		authorization_servers: [getIssuerUrl(flags)],
		scopes_supported: [...MCP_OAUTH_SCOPES],
		bearer_methods_supported: ["header"],
		resource_name: "Autumn MCP",
	};
}

export function getAuthorizationServerMetadata(flags: MCPOAuthFlags) {
	const issuer = getIssuerUrl(flags);
	return {
		issuer,
		authorization_endpoint: `${issuer}/oauth2/authorize`,
		token_endpoint: `${issuer}/oauth2/token`,
		registration_endpoint: `${issuer}/oauth2/register`,
		revocation_endpoint: `${issuer}/oauth2/revoke`,
		introspection_endpoint: `${issuer}/oauth2/introspect`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		token_endpoint_auth_methods_supported: [
			"client_secret_post",
			"client_secret_basic",
			"none",
		],
		code_challenge_methods_supported: ["S256"],
		scopes_supported: [...MCP_OAUTH_SCOPES],
	};
}

function getEnvironment(
	headers: Headers,
	flags: MCPOAuthFlags,
): OAuthEnvironment {
	const value =
		headers.get("x-autumn-environment") ??
		flags["oauth-environment"] ??
		"sandbox";
	const parsed = environmentSchema.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new OAuthHttpError(
		400,
		"Invalid x-autumn-environment",
		"invalid_request",
	);
}

function parseRequestOption<T>(
	value: unknown,
	schema: z.ZodType<T>,
	message: string,
): T {
	const parsed = schema.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new OAuthHttpError(400, message, "invalid_request");
}

async function exchangeOAuthToken(
	headers: Headers,
	flags: MCPOAuthFlags,
	resource: string,
	token: string,
): Promise<{
	key: string;
	orgId?: string | undefined;
	userId?: string | undefined;
	clientId?: string | undefined;
	scopes?: string[];
}> {
	const env = getEnvironment(headers, flags);
	const cacheKey = `${token}:${resource}:${env}`;
	const cached = apiKeyCache.get(cacheKey);
	if (cached && isFuture(cached.expiresAt)) return cached;

	const response = await fetch(getApiKeyUrl(flags), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ resource, scopes: MCP_OAUTH_SCOPES }),
	});

	if (!response.ok) {
		throw new OAuthHttpError(
			response.status === 403 ? 403 : 401,
			await response.text(),
			response.status === 403 ? "insufficient_scope" : "invalid_token",
			response.status === 403
				? undefined
				: getWWWAuthenticate(resource, "invalid_token"),
		);
	}

	const data = tokenExchangeSchema.parse(await response.json());
	const key = env === "live" ? data.prod_key : data.sandbox_key;
	if (!key) {
		throw new OAuthHttpError(
			502,
			"OAuth key exchange did not return an API key",
		);
	}

	const exchanged = {
		key,
		orgId: data.org_id,
		userId: data.user_id,
		clientId: data.client_id,
		scopes: data.scopes,
		expiresAt: addMilliseconds(new Date(), ms.minutes(1)),
	};
	apiKeyCache.set(cacheKey, exchanged);
	return exchanged;
}

function getOAuthPrincipalId(
	token: string,
	exchanged: Awaited<ReturnType<typeof exchangeOAuthToken>>,
) {
	if (!exchanged.orgId) return principalFromSecret("oauth", token);

	return [
		"oauth",
		exchanged.orgId,
		exchanged.userId ?? "unknown-user",
		exchanged.clientId ?? "unknown-client",
	].join(":");
}

export async function buildAuthForRequest(
	headers: Headers,
	flags: MCPOAuthFlags,
	logger: ConsoleLogger,
	resourcePath = "/mcp",
): Promise<AutumnMcpAuth> {
	const env = getEnvironment(headers, flags);
	const resource = getResourceUrl(headers, flags, resourcePath);
	const xApiVersion = parseRequestOption(
		headers.get("x-api-version") ?? flags["x-api-version"],
		xApiVersionSchema,
		"Invalid x-api-version",
	);
	const failOpen = parseRequestOption(
		headers.get("fail-open") ?? flags["fail-open"],
		failOpenSchema,
		"Invalid fail-open",
	);

	if (flags["oauth-enabled"]) {
		const authHeader = headers.get("authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			throw new OAuthHttpError(
				401,
				"Missing Authorization bearer token",
				"invalid_token",
				getWWWAuthenticate(resource),
			);
		}

		const token = authHeader.slice("Bearer ".length);
		const exchanged = await exchangeOAuthToken(headers, flags, resource, token);
		return {
			apiKey: exchanged.key,
			env,
			resource,
			principalId: getOAuthPrincipalId(token, exchanged),
			scopes: exchanged.scopes ?? [...MCP_OAUTH_SCOPES],
			orgId: exchanged.orgId,
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	const apiKey = parseRequestOption(
		headers.get("secret-key") ?? flags["secret-key"],
		secretKeySchema,
		"Invalid secret-key",
	);
	if (!apiKey) {
		logger.warning("Missing secret-key for MCP request");
		throw new OAuthHttpError(401, "Missing secret-key", "invalid_token");
	}

	return {
		apiKey,
		env,
		resource,
		principalId: principalFromSecret("secret-key", apiKey),
		scopes: [...MCP_OAUTH_SCOPES],
		serverURL: flags["server-url"],
		xApiVersion,
		failOpen,
	};
}
