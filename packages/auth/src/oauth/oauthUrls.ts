const trimTrailingSlash = (url: string) =>
	url.endsWith("/") ? url.slice(0, -1) : url;

export const getOAuthIssuerUrl = ({
	authPath = "/api/auth",
	baseUrl,
}: {
	authPath?: string;
	baseUrl: string;
}): string => trimTrailingSlash(new URL(authPath, baseUrl).href);

export const getProtectedResourceMetadataUrl = ({
	resourceUrl,
}: {
	resourceUrl: string;
}): string => {
	const url = new URL(resourceUrl);
	const path = url.pathname === "/" ? "" : url.pathname;
	return new URL(`/.well-known/oauth-protected-resource${path}`, url).href;
};

export const getWwwAuthenticateHeader = ({
	error,
	resourceMetadataUrl,
}: {
	error?: string;
	resourceMetadataUrl: string;
}): string => {
	const params = [`resource_metadata="${resourceMetadataUrl}"`];
	if (error) params.push(`error="${error}"`);
	return `Bearer ${params.join(", ")}`;
};
