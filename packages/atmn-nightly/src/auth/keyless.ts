import { AutumnApiError } from "../generated/client";

/**
 * Keyless onboarding: a sandbox org with no owner, minted for an agent or a
 * human who has no account yet, and linked to an account later. Not in the
 * spec, so hand-written like the key-minting call rather than generated.
 */

export type ProvisionedOrg = {
	organizationId: string;
	organizationSlug: string;
	apiKey: string;
	claimToken: string;
	claimUrl: string;
	/** ISO 8601: after this the org can no longer be linked to anyone. */
	claimExpiresAt: string;
};

export type ClaimStarted = {
	/** ISO 8601: the one-time code stops working after this. */
	expiresAt: string;
};

export type ClaimVerified = {
	organizationId: string;
	organizationSlug: string;
	userId: string;
	email: string;
};

type Fetch = typeof globalThis.fetch;

const post = async ({
	baseUrl,
	path,
	body,
	secretKey,
	fetch = globalThis.fetch,
}: {
	baseUrl: string;
	path: string;
	body: Record<string, unknown>;
	secretKey?: string;
	fetch?: Fetch;
}): Promise<Record<string, unknown>> => {
	const response = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(secretKey === undefined
				? {}
				: { authorization: `Bearer ${secretKey}` }),
		},
		body: JSON.stringify(body),
	});
	const text = await response.text();
	const parsed: unknown = text ? JSON.parse(text) : null;
	if (!response.ok)
		throw new AutumnApiError({ status: response.status, body: parsed, path });
	return (parsed ?? {}) as Record<string, unknown>;
};

export const provisionKeylessOrg = async ({
	baseUrl,
	name,
	slug,
	fetch,
}: {
	baseUrl: string;
	name: string;
	slug: string;
	fetch?: Fetch;
}): Promise<ProvisionedOrg> => {
	const body = await post({
		baseUrl,
		path: "/agent.provision",
		body: { name: name.slice(0, MAX_NAME_LENGTH), slug },
		fetch,
	});
	return {
		organizationId: String(body.organization_id),
		organizationSlug: String(body.organization_slug),
		apiKey: String(body.api_key),
		claimToken: String(body.claim_token),
		claimUrl: String(body.claim_url),
		claimExpiresAt: String(body.claim_expires_at),
	};
};

/** Emails a one-time code to `email`; the org is the one `secretKey` belongs to. */
export const startClaim = async ({
	baseUrl,
	secretKey,
	email,
	fetch,
}: {
	baseUrl: string;
	secretKey: string;
	email: string;
	fetch?: Fetch;
}): Promise<ClaimStarted> => {
	const body = await post({
		baseUrl,
		path: "/agent.claim",
		body: { email },
		secretKey,
		fetch,
	});
	return { expiresAt: String(body.expires_at) };
};

export const verifyClaim = async ({
	baseUrl,
	email,
	otp,
	fetch,
}: {
	baseUrl: string;
	email: string;
	otp: string;
	fetch?: Fetch;
}): Promise<ClaimVerified> => {
	const body = await post({
		baseUrl,
		path: "/agent.verify",
		body: { email, otp },
		fetch,
	});
	return {
		organizationId: String(body.organization_id),
		organizationSlug: String(body.organization_slug),
		userId: String(body.user_id),
		email: String(body.email),
	};
};

/** A slug the server accepts: lowercase alphanumerics, `-` or `_` between words. */
/** The server caps a name and a slug at 100 characters. */
const MAX_NAME_LENGTH = 100;

export const slugFor = (name: string): string =>
	name
		.toLowerCase()
		.replace(/^@[^/]+\//, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_NAME_LENGTH)
		.replace(/-+$/, "") || "autumn";
