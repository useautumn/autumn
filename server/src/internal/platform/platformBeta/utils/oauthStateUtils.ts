import { randomBytes } from "node:crypto";
import { type AppEnv, InternalError } from "@autumn/shared";
import {
	deleteOAuthStateData,
	getOAuthStateData,
	setOAuthStateData,
} from "@/external/redis/actions/oauthStateStore/oauthStateStore.js";

type OAuthState = {
	organization_slug: string;
	env: AppEnv;
	redirect_uri: string;
	master_org_id: string | null; // null for standard flow, string for platform flow
	code_verifier?: string;
	provider?: "stripe" | "revenuecat";
	revenuecat_project_name?: string;
	// true for the API-key → OAuth migration flow
	migration?: boolean;
};

/**
 * Generates a unique OAuth state key and stores it in Upstash
 * Retries up to 3 times if key already exists (race condition prevention)
 */
export const generateOAuthState = async ({
	organizationSlug,
	env,
	redirectUri,
	masterOrgId,
	codeVerifier,
	provider,
	revenuecatProjectName,
	migration,
}: {
	organizationSlug: string;
	env: AppEnv;
	redirectUri: string;
	masterOrgId: string | null;
	codeVerifier?: string;
	provider?: "stripe" | "revenuecat";
	revenuecatProjectName?: string;
	migration?: boolean;
}): Promise<string> => {
	const maxAttempts = 3;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		// Generate random state key
		const stateKey = randomBytes(32).toString("hex");

		// Try to set the key
		const stateData: OAuthState = {
			organization_slug: organizationSlug,
			env,
			redirect_uri: redirectUri,
			master_org_id: masterOrgId,
			...(codeVerifier ? { code_verifier: codeVerifier } : {}),
			...(provider ? { provider } : {}),
			...(revenuecatProjectName
				? { revenuecat_project_name: revenuecatProjectName }
				: {}),
			...(migration ? { migration: true } : {}),
		};

		// Check if key exists first
		const existing = await getOAuthStateData<OAuthState>({ stateKey });
		if (!existing) {
			// Key doesn't exist, set it with expiry
			await setOAuthStateData({ stateKey, data: stateData });
			return stateKey;
		}

		// Key already exists, retry
		if (attempt < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 50)); // Wait 50ms before retry
		}
	}

	throw new InternalError({
		message:
			"Failed to generate unique OAuth state after 3 attempts. Please try again.",
		code: "oauth_state_generation_failed",
	});
};

/**
 * Retrieves and deletes OAuth state from Upstash
 * Returns null if state doesn't exist or has expired
 */
export const consumeOAuthState = async ({
	stateKey,
}: {
	stateKey: string;
}): Promise<OAuthState | null> => {
	const stateData = await getOAuthStateData<OAuthState>({ stateKey });

	if (!stateData) {
		return null;
	}

	// Delete the key
	await deleteOAuthStateData({ stateKey });

	return stateData;
};
