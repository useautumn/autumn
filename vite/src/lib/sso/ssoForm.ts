export interface SsoFormValues {
	domain: string;
	issuer: string;
	clientId: string;
	clientSecret: string;
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/;

/** Accepts pasted values like "https://Acme.com/" and stores "acme.com". */
export const normalizeSsoDomain = (raw: string) => {
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed) return "";
	const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
	const withoutPath = withoutScheme.split(/[/?#]/)[0];
	const withoutUserInfo = withoutPath.split("@").pop() ?? "";
	const withoutPort = withoutUserInfo.split(":")[0];
	return withoutPort.replace(/\.$/, "");
};

export const normalizeSsoIssuer = (raw: string) =>
	raw.trim().replace(/\/$/, "");

/** Returns the first validation problem, or null when the form can be saved. */
export const validateSsoForm = (
	values: SsoFormValues,
	{ allowInsecureLocalhost = false } = {},
): string | null => {
	const domain = normalizeSsoDomain(values.domain);
	if (!domain) return "Enter your company domain.";
	if (!DOMAIN_REGEX.test(domain))
		return "Enter a valid company domain, like acme.com.";

	const issuer = normalizeSsoIssuer(values.issuer);
	if (!issuer) return "Enter the OIDC issuer URL.";
	let issuerUrl: URL;
	try {
		issuerUrl = new URL(issuer);
	} catch {
		return "Enter a valid issuer URL, like https://login.acme.com.";
	}
	const isLocalhost =
		issuerUrl.hostname === "localhost" || issuerUrl.hostname === "127.0.0.1";
	if (
		issuerUrl.protocol !== "https:" &&
		!(allowInsecureLocalhost && isLocalhost)
	)
		return "The issuer URL must use https://.";

	if (!values.clientId.trim()) return "Enter the OIDC client ID.";
	if (!values.clientSecret.trim()) return "Enter the OIDC client secret.";

	return null;
};

export const buildSsoConnectionPayload = (values: SsoFormValues) => ({
	domain: normalizeSsoDomain(values.domain),
	issuer: normalizeSsoIssuer(values.issuer),
	clientId: values.clientId.trim(),
	clientSecret: values.clientSecret.trim(),
});

export const maskClientId = (lastFour: string) => {
	const suffix = lastFour.trim();
	return suffix ? `${"\u2022".repeat(8)}${suffix}` : "\u2022".repeat(12);
};
