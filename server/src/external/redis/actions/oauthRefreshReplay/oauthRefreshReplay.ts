import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import { timeout } from "@/utils/genUtils.js";

const REFRESH_REPLAY_TTL_SECONDS = 30;
const REFRESH_REPLAY_PENDING = "pending";
const CLAIM_MAX_ATTEMPTS = 200;
const CLAIM_POLL_MS = 25;

/**
 * Keyed on a fingerprint of the whole refresh request (resource + authorization
 * header + normalized body), not on the refresh token: two different requests
 * carrying the same token are different grants and must not share a response.
 */
export const buildOAuthRefreshReplayKey = (requestFingerprint: string) =>
	`oauth:refresh-replay:${requestFingerprint}`;

export type OAuthRefreshReplayClaim = {
	/** The winner's stored token response, when this caller lost the race. */
	body: Record<string, unknown> | null;
	/**
	 * True when this caller won the key and is the one minting: it owes the key
	 * either a stored response or a release once it finishes. False when there
	 * is no key to hand back — either this caller lost the race and got `body`,
	 * or Redis could not answer and the caller mints with no dedupe at all.
	 */
	holdsKey: boolean;
};

/** Redis is unreachable: nothing to replay, nothing to hand back afterwards. */
const NO_KEY_HELD: OAuthRefreshReplayClaim = {
	body: null,
	holdsKey: false,
};

/**
 * Single-flight guard for OAuth refresh-token replays: the first caller claims
 * the key (SET NX) and mints tokens; concurrent replays of the SAME refresh
 * token spin until the winner stores its response, then return that body.
 *
 * Dedupe is an optimisation, never a dependency: if Redis cannot answer, the
 * claim comes back holding no key and the token endpoint carries on unguarded.
 * Only a genuine spin-out — the winner held the key past its polling budget —
 * returns null, because minting alongside it would race the token rotation.
 */
export const claimOAuthRefreshReplay = async (
	key: string,
): Promise<OAuthRefreshReplayClaim | null> => {
	try {
		const miscRedis = getMiscRedis();

		for (let attempt = 0; attempt < CLAIM_MAX_ATTEMPTS; attempt++) {
			const value = await tryRedisOp({
				operation: () => miscRedis.get(key),
				source: "oauth-refresh-replay:read",
				redisInstance: miscRedis,
			});
			// undefined = Redis unavailable (vs null = key missing) — bail out.
			if (value === undefined) return NO_KEY_HELD;

			if (value && value !== REFRESH_REPLAY_PENDING) {
				return {
					body: JSON.parse(decryptData(value)) as Record<string, unknown>,
					holdsKey: false,
				};
			}

			if (!value) {
				const claimed = await tryRedisOp({
					operation: () =>
						miscRedis.set(
							key,
							REFRESH_REPLAY_PENDING,
							"EX",
							REFRESH_REPLAY_TTL_SECONDS,
							"NX",
						),
					source: "oauth-refresh-replay:claim",
					redisInstance: miscRedis,
				});
				if (claimed === undefined) return NO_KEY_HELD;
				if (claimed) return { body: null, holdsKey: true };
			}

			await timeout(CLAIM_POLL_MS);
		}
		return null;
	} catch {
		// Redis missing, or a stored response we cannot decrypt/parse. Either way
		// there is nothing to replay, so mint instead of failing the refresh.
		return NO_KEY_HELD;
	}
};

/**
 * Drops a claim the winner never stored a response for, so retries of the same
 * refresh token re-race immediately instead of spinning out the claim's TTL.
 */
export const releaseOAuthRefreshReplay = async (key: string): Promise<void> => {
	try {
		const miscRedis = getMiscRedis();
		await tryRedisOp({
			operation: () => miscRedis.del(key),
			source: "oauth-refresh-replay:release",
			redisInstance: miscRedis,
		});
	} catch {
		// Best-effort — a stranded claim still expires with its TTL.
	}
};

/** Winner stores its (encrypted) token response for spinning replayers. */
export const storeOAuthRefreshReplay = async ({
	body,
	key,
}: {
	body: Record<string, unknown>;
	key: string;
}): Promise<void> => {
	try {
		const miscRedis = getMiscRedis();
		await tryRedisOp({
			operation: () =>
				miscRedis.set(
					key,
					encryptData(JSON.stringify(body)),
					"EX",
					REFRESH_REPLAY_TTL_SECONDS,
				),
			source: "oauth-refresh-replay:store",
			redisInstance: miscRedis,
		});
	} catch {
		// Best-effort — replayers fall back to "temporarily_unavailable".
	}
};
