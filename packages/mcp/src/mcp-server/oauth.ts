import { type ScopeString, Scopes } from "@autumn/shared/scopeDefinitions";
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
] as const satisfies readonly ScopeString[];

export type OAuthEnvironment = "sandbox" | "live";

export interface MCPOAuthFlags extends MCPServerFlags {
	readonly "disable-static-auth": boolean;
	readonly "oauth-enabled"?: boolean | undefined;
	readonly "oauth-issuer-url"?: string | undefined;
	readonly "oauth-resource-url"?: string | undefined;
	readonly "oauth-api-key-url"?: string | undefined;
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

const apiKeyCache = new Map<string, { key: string; expiresAt: number }>();

function trimTrailingSlash(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getResourceUrl(headers: Headers, flags: MCPOAuthFlags): string {
	if (flags["oauth-resource-url"]) {
		return trimTrailingSlash(flags["oauth-resource-url"]);
	}

	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	if (!host) {
		throw new OAuthHttpError(400, "Missing Host header", "invalid_request");
	}

	const proto = headers.get("x-forwarded-proto") ?? "http";
	return new URL("/mcp", `${proto}://${host}`).href;
}

export function getProtectedResourceMetadataUrl(resourceUrl: string): string {
	const url = new URL(resourceUrl);
	const path = url.pathname === "/" ? "" : url.pathname;
	return new URL(`/.well-known/oauth-protected-resource${path}`, url).href;
}

function getIssuerUrl(flags: MCPOAuthFlags): string {
	if (flags["oauth-issuer-url"]) {
		return trimTrailingSlash(flags["oauth-issuer-url"]);
	}

	return trimTrailingSlash(
		new URL("/api/auth", flags["server-url"] ?? "https://api.useautumn.com")
			.href,
	);
}

function getApiKeyUrl(flags: MCPOAuthFlags): string {
	return (
		flags["oauth-api-key-url"] ??
		new URL("/cli/api-keys", getIssuerUrl(flags)).href
	);
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
) {
	const resource = getResourceUrl(headers, flags);
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
	if (value === "sandbox" || value === "live") return value;
	throw new OAuthHttpError(
		400,
		"Invalid x-autumn-environment",
		"invalid_request",
	);
}

async function exchangeOAuthToken(
	headers: Headers,
	flags: MCPOAuthFlags,
	resource: string,
	token: string,
): Promise<string> {
	const env = getEnvironment(headers, flags);
	const cacheKey = `${token}:${resource}:${env}`;
	const cached = apiKeyCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.key;

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

	const data = (await response.json()) as {
		sandbox_key?: string;
		prod_key?: string;
	};
	const key = env === "live" ? data.prod_key : data.sandbox_key;
	if (!key) {
		throw new OAuthHttpError(
			502,
			"OAuth key exchange did not return an API key",
		);
	}

	apiKeyCache.set(cacheKey, { key, expiresAt: Date.now() + 60_000 });
	return key;
}

function resolveStaticHeader<T>(
	headers: Headers,
	headerName: string,
	schema: z.ZodType<T>,
	cliFlagValue: T | undefined,
	disableStaticAuth: boolean,
): T | undefined {
	const value = headers.get(headerName);
	if (value != null) return schema.parse(value);
	if (disableStaticAuth) return undefined;
	return cliFlagValue === undefined ? schema.parse(undefined) : cliFlagValue;
}

export async function buildAuthForRequest(
	headers: Headers,
	flags: MCPOAuthFlags,
	logger: ConsoleLogger,
): Promise<AutumnMcpAuth> {
	const env = getEnvironment(headers, flags);
	const resource = getResourceUrl(headers, flags);
	const xApiVersion = resolveStaticHeader(
		headers,
		"x-api-version",
		z.string().default("2.3.0"),
		flags["x-api-version"],
		flags["disable-static-auth"],
	);
	const failOpen = resolveStaticHeader(
		headers,
		"fail-open",
		z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
		flags["fail-open"],
		flags["disable-static-auth"],
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
		const apiKey = await exchangeOAuthToken(headers, flags, resource, token);
		return {
			apiKey,
			env,
			resource,
			principalId: principalFromSecret("oauth", token),
			scopes: [...MCP_OAUTH_SCOPES],
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	const apiKey = resolveStaticHeader(
		headers,
		"secret-key",
		z.string(),
		flags["secret-key"],
		flags["disable-static-auth"],
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
