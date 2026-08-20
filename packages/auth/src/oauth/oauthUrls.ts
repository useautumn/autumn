const trimTrailingSlash = (url: string) =>
	url.endsWith("/") ? url.slice(0, -1) : url;

export const getOAuthIssuerUrl = ({
	authPath = "/api/auth",
	baseUrl,
}: {
	authPath?: string;
	baseUrl: string;
}): string => trimTrailingSlash(new URL(authPath, baseUrl).href);

const OAUTH_RESOURCE_SCHEMES = new Set(["http:", "https:"]);

/**
 * RFC 8707 §2 canonical resource identifier: lowercase scheme and host, no
 * fragment, no trailing slash. Path and query keep their case and content.
 */
export const canonicalizeOAuthResource = (
	resource: string | null | undefined,
): string | null => {
	if (!resource || !URL.canParse(resource)) return null;

	const url = new URL(resource);
	if (!OAUTH_RESOURCE_SCHEMES.has(url.protocol)) return null;

	return `${url.protocol}//${url.host}${trimTrailingSlash(url.pathname)}${url.search}`;
};

/**
 * A null audience means the token request named no resource, which older
 * MCP-spec clients never do; those grants stay usable everywhere. A stamped
 * grant is only usable at the exact resource it names.
 */
export const oauthAudienceAllowsResource = ({
	grantResource,
	resourceUrl,
}: {
	grantResource: string | null | undefined;
	resourceUrl: string;
}): boolean => {
	if (!grantResource) return true;

	const audience = canonicalizeOAuthResource(grantResource);
	return (
		audience !== null && audience === canonicalizeOAuthResource(resourceUrl)
	);
};

export const getProtectedResourceMetadataUrl = ({
	resourceUrl,
}: {
	resourceUrl: string;
}): string => {
	const url = new URL(resourceUrl);
	const path = url.pathname === "/" ? "" : url.pathname;
	return new URL(`/.well-known/oauth-protected-resource${path}`, url).href;
};

/** RFC 6750 §3 challenge; `scopes` become the space-delimited `scope` param. */
export const getWwwAuthenticateHeader = ({
	error,
	resourceMetadataUrl,
	scopes,
}: {
	error?: string;
	resourceMetadataUrl: string;
	scopes?: readonly string[];
}): string => {
	const params = [`resource_metadata="${resourceMetadataUrl}"`];
	if (scopes?.length) params.push(`scope="${scopes.join(" ")}"`);
	if (error) params.push(`error="${error}"`);
	return `Bearer ${params.join(", ")}`;
};
