import { AsyncLocalStorage } from "node:async_hooks";

const trustedSsoOrigins = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Hosted providers serve their discovery endpoints from other origins than the
 * issuer, and better-auth checks every discovered endpoint against the trusted
 * origins. Keyed by issuer hostname suffix.
 */
const COMPANION_ORIGINS: ReadonlyArray<[string, readonly string[]]> = [
	[
		"accounts.google.com",
		[
			"https://oauth2.googleapis.com",
			"https://openidconnect.googleapis.com",
			"https://www.googleapis.com",
		],
	],
	["login.microsoftonline.com", ["https://graph.microsoft.com"]],
];

export const getSsoIssuerOrigins = (issuer: string): string[] => {
	const { origin, hostname } = new URL(issuer);
	const companions = COMPANION_ORIGINS.find(
		([host]) => hostname === host || hostname.endsWith(`.${host}`),
	);
	return [origin, ...(companions?.[1] ?? [])];
};

export const withTrustedSsoOrigin = async <T>({
	origin,
	run,
}: {
	origin: string;
	run: () => Promise<T>;
}): Promise<T> =>
	trustedSsoOrigins.run(new Set(getSsoIssuerOrigins(origin)), run);

export const getTrustedSsoOrigins = (): string[] => [
	...(trustedSsoOrigins.getStore() ?? []),
];
