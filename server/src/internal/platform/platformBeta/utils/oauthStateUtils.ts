import { randomBytes } from "node:crypto";
import { InternalError } from "@autumn/shared";
import { initUpstash } from "@/internal/customers/cusCache/upstashUtils.js";

const STATE_KEY_PREFIX = "oauth_state:";
const STATE_EXPIRY_SECONDS = 10 * 60; // 10 minutes

export type OAuthState = {
	organization_slug: string;
	env: "test" | "live";
	redirect_uri: string;
	master_org_id: string | null; // null for standard flow, string for platform flow
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
}: {
	organizationSlug: string;
	env: "test" | "live";
	redirectUri: string;
	masterOrgId: string | null;
}): Promise<string> => {
	const upstash = await initUpstash();
	if (!upstash) {
		throw new InternalError({
			message: "Upstash not configured",
			code: "upstash_not_configured",
		});
	}

	const maxAttempts = 3;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		// Generate random state key
		const stateKey = randomBytes(32).toString("hex");
		const redisKey = `${STATE_KEY_PREFIX}${stateKey}`;

		// Try to set the key
		const stateData: OAuthState = {
			organization_slug: organizationSlug,
			env,
			redirect_uri: redirectUri,
			master_org_id: masterOrgId,
		};

		// Check if key exists first
		const existing = await upstash.get(redisKey);
		if (!existing) {
			// Key doesn't exist, set it with expiry
			await upstash.set(redisKey, stateData, { ex: STATE_EXPIRY_SECONDS });
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
	const upstash = await initUpstash();
	if (!upstash) {
		throw new InternalError({
			message: "Upstash not configured",
			code: "upstash_not_configured",
		});
	}

	const redisKey = `${STATE_KEY_PREFIX}${stateKey}`;

	// Get the data
	const stateData = await upstash.get<OAuthState>(redisKey);

	if (!stateData) {
		return null;
	}

	// Delete the key
	await upstash.del(redisKey);

	return stateData;
};
