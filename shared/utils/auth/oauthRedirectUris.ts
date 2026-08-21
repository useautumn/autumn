const DANGEROUS_REDIRECT_SCHEMES = new Set([
	"javascript:",
	"data:",
	"vbscript:",
]);

// `URL.hostname` keeps IPv6 literals bracketed, so `::1` alone never matches.
const LOOPBACK_REDIRECT_HOSTNAMES = new Set([
	"localhost",
	"127.0.0.1",
	"[::1]",
]);

export const isSafeOAuthRedirectUri = (redirectUri: string) => {
	if (!URL.canParse(redirectUri)) return false;

	const url = new URL(redirectUri);
	if (DANGEROUS_REDIRECT_SCHEMES.has(url.protocol)) return false;
	if (url.protocol === "http:") {
		return LOOPBACK_REDIRECT_HOSTNAMES.has(url.hostname);
	}

	return true;
};
