import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { parse } from "tldts";

export const SSO_VERIFICATION_PREFIX = "autumn-sso-verification";

const isSupportedHostedIssuer = (hostname: string) =>
	hostname === "accounts.google.com" ||
	hostname === "login.microsoftonline.com" ||
	hostname.endsWith(".okta.com") ||
	hostname.endsWith(".oktapreview.com") ||
	hostname.endsWith(".auth0.com");

export const normalizeSsoDomain = (rawDomain: string): string => {
	const trimmed = rawDomain.trim().replace(/\.$/, "").toLowerCase();
	if (
		!trimmed ||
		trimmed.includes("://") ||
		trimmed.includes("/") ||
		trimmed.includes(" ")
	) {
		throw new Error("Enter a bare company domain");
	}

	const domain = domainToASCII(trimmed);
	if (!domain || isIP(domain)) {
		throw new Error("Enter a valid company domain");
	}

	const parsed = parse(domain);
	if (!parsed.domain || !parsed.publicSuffix || parsed.domain !== domain) {
		throw new Error("Enter a registrable company domain");
	}

	return domain;
};

export const getSsoVerificationIdentifier = ({
	providerId,
}: {
	providerId: string;
}) => `_${SSO_VERIFICATION_PREFIX}-${providerId}`;

export const buildSsoVerificationHost = ({
	domain,
	providerId,
}: {
	domain: string;
	providerId: string;
}) => `${getSsoVerificationIdentifier({ providerId })}.${domain}`;

export const isMatchingSsoVerificationRecord = ({
	records,
	identifier,
	token,
}: {
	records: string[][];
	identifier: string;
	token: string;
}) =>
	records
		.map((chunks) => chunks.join("").trim())
		.some((record) => record === token || record === `${identifier}=${token}`);

export const validateSsoIssuer = ({
	issuer,
	isProduction,
}: {
	issuer: string;
	isProduction: boolean;
}) => {
	const url = new URL(issuer.trim());
	const isLocalhost =
		url.hostname === "localhost" || url.hostname === "127.0.0.1";

	if (url.protocol !== "https:" && !(isLocalhost && !isProduction)) {
		throw new Error("OIDC issuer must use HTTPS");
	}
	if (isProduction && !isSupportedHostedIssuer(url.hostname)) {
		throw new Error(
			"OIDC issuer must be hosted by Okta, Microsoft Entra, Google Workspace, or Auth0",
		);
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error(
			"OIDC issuer must not include credentials, query, or fragment",
		);
	}

	return url;
};
