import { AutumnApiError } from "../generated/client";
import { autumnFetch } from "../http/autumnFetch";

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
	/** ISO 8601: after this the org can no longer be linked to anyone. */
	claimExpiresAt: string;
};

export type ClaimStarted = {
	claimUrl: string;
	/** ISO 8601: after this the browser claim link stops working. */
	expiresAt: string;
};

type Fetch = typeof globalThis.fetch;

const post = async ({
	baseUrl,
	path,
	body,
	secretKey,
	fetch = autumnFetch,
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
		claimExpiresAt: String(body.claim_expires_at),
	};
};

/** Creates and emails a browser claim link for the org `secretKey` belongs to. */
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
		path: "/agent.start_claim",
		body: { email },
		secretKey,
		fetch,
	});
	return {
		claimUrl: String(body.claim_url),
		expiresAt: String(body.expires_at),
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
