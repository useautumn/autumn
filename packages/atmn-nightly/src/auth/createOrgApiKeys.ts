import { getApiKeysEndpoint } from "./oauthConfig";
import type { OrgApiKeys } from "./types/orgApiKeys";

type ApiKeysResponse = {
	sandbox_key?: string;
	prod_key?: string;
	org_id?: string;
	message?: string;
	error?: string;
};

/** Mint the org's sandbox and production keys from the OAuth access token. */
export const createOrgApiKeys = async ({
	accessToken,
	backendUrl,
	fetch = globalThis.fetch,
}: {
	accessToken: string;
	backendUrl: string;
	fetch?: typeof globalThis.fetch;
}): Promise<OrgApiKeys> => {
	const response = await fetch(getApiKeysEndpoint({ backendUrl }), {
		method: "POST",
		headers: {
			authorization: `Bearer ${accessToken}`,
			"content-type": "application/json",
		},
	});

	const body = (await response.json().catch(() => ({}))) as ApiKeysResponse;

	if (!response.ok) {
		throw new Error(
			body.message ??
				body.error ??
				`Failed to create API keys (${response.status})`,
		);
	}

	return {
		sandboxKey: body.sandbox_key,
		prodKey: body.prod_key,
		orgId: body.org_id,
	};
};
