import { z } from "zod/v4";

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

export const validateSsoDomain = (raw: string): string | null => {
	const domain = normalizeSsoDomain(raw);
	if (!domain) return "Enter your company domain.";
	if (!DOMAIN_REGEX.test(domain))
		return "Enter a valid company domain, like acme.com.";
	return null;
};

export const validateSsoIssuer = (
	raw: string,
	{ allowInsecureLocalhost = false } = {},
): string | null => {
	const issuer = normalizeSsoIssuer(raw);
	if (!issuer) return "Enter the OIDC issuer URL.";

	let url: URL;
	try {
		url = new URL(issuer);
	} catch {
		return "Enter a valid issuer URL, like https://login.acme.com.";
	}

	const isLocalhost =
		url.hostname === "localhost" || url.hostname === "127.0.0.1";
	if (url.protocol !== "https:" && !(allowInsecureLocalhost && isLocalhost))
		return "The issuer URL must use https://.";
	return null;
};

const requiredField = (message: string) => (raw: string) =>
	raw.trim() ? null : message;

export const validateSsoClientId = requiredField("Enter the OIDC client ID.");
export const validateSsoClientSecret = requiredField(
	"Enter the OIDC client secret.",
);

/** Reports at most one issue per field so the inline error stays a single line. */
const fieldSchema = (validate: (value: string) => string | null) =>
	z.string().superRefine((value, ctx) => {
		const message = validate(value);
		if (message) ctx.addIssue({ code: "custom", message });
	});

export const createSsoFormSchema = ({ allowInsecureLocalhost = false } = {}) =>
	z.object({
		domain: fieldSchema(validateSsoDomain),
		issuer: fieldSchema((value) =>
			validateSsoIssuer(value, { allowInsecureLocalhost }),
		),
		clientId: fieldSchema(validateSsoClientId),
		clientSecret: fieldSchema(validateSsoClientSecret),
	});

export const buildSsoConnectionPayload = (values: SsoFormValues) => ({
	domain: normalizeSsoDomain(values.domain),
	issuer: normalizeSsoIssuer(values.issuer),
	clientId: values.clientId.trim(),
	clientSecret: values.clientSecret.trim(),
});

export const maskClientId = (lastFour: string) => {
	const suffix = lastFour.trim();
	return suffix ? `${"•".repeat(8)}${suffix}` : "•".repeat(12);
};
