import { DEFAULT_AUTUMN_API_URL } from "../../../constants.js";
import { OAuthHttpError } from "./errors.js";
import type { MCPOAuthFlags } from "./schemas.js";

const trimTrailingSlash = (url: string) =>
	url.endsWith("/") ? url.slice(0, -1) : url;

/** Host the client reached us on, honouring Autumn's proxy forwarding headers. */
const getForwardedHost = (headers: Headers) =>
	headers.get("x-autumn-forwarded-host") ??
	headers.get("x-forwarded-host") ??
	headers.get("host");

const getForwardedProto = (headers: Headers) =>
	headers.get("x-autumn-forwarded-proto") ??
	headers.get("x-forwarded-proto") ??
	"http";

/** Absolute URL of the MCP resource the current request is targeting. */
export const getResourceUrl = ({
	headers,
	resourcePath = "/mcp",
}: {
	headers: Headers;
	resourcePath?: string;
}): string => {
	const host = getForwardedHost(headers);
	if (!host) {
		throw new OAuthHttpError(400, "Missing Host header", "invalid_request");
	}

	return new URL(resourcePath, `${getForwardedProto(headers)}://${host}`).href;
};

export const getProtectedResourceMetadataUrl = (
	resourceUrl: string,
): string => {
	const url = new URL(resourceUrl);
	const path = url.pathname === "/" ? "" : url.pathname;
	return new URL(`/.well-known/oauth-protected-resource${path}`, url).href;
};

export const getIssuerUrl = (flags: MCPOAuthFlags): string =>
	trimTrailingSlash(
		new URL("/api/auth", flags["server-url"] ?? DEFAULT_AUTUMN_API_URL).href,
	);

export const getApiKeyUrl = (flags: MCPOAuthFlags): string =>
	new URL("/cli/api-keys", getIssuerUrl(flags)).href;

export const getWWWAuthenticate = ({
	resourceUrl,
	error,
}: {
	resourceUrl: string;
	error?: string;
}): string => {
	const params = [
		`resource_metadata="${getProtectedResourceMetadataUrl(resourceUrl)}"`,
	];
	if (error) params.push(`error="${error}"`);
	return `Bearer ${params.join(", ")}`;
};
