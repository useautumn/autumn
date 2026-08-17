const DANGEROUS_REDIRECT_SCHEMES = new Set([
	"javascript:",
	"data:",
	"vbscript:",
]);

export const isLocalhostRedirectUri = (hostname: string) =>
	hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

export const isSafeOAuthRedirectUri = (redirectUri: string) => {
	if (!URL.canParse(redirectUri)) return false;

	const url = new URL(redirectUri);
	if (DANGEROUS_REDIRECT_SCHEMES.has(url.protocol)) return false;
	if (url.protocol === "http:") return isLocalhostRedirectUri(url.hostname);

	return true;
};
