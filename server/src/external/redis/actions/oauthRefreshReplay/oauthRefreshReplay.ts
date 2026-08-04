import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import { timeout } from "@/utils/genUtils.js";

const REFRESH_REPLAY_TTL_SECONDS = 30;
const REFRESH_REPLAY_PENDING = "pending";
const CLAIM_MAX_ATTEMPTS = 200;
const CLAIM_POLL_MS = 25;

export const buildOAuthRefreshReplayKey = (hashedToken: string) =>
	`oauth:refresh-replay:${hashedToken}`;

/**
 * Single-flight guard for OAuth refresh-token replays: the first caller claims
 * the key (SET NX) and mints tokens; concurrent replays of the SAME refresh
 * token spin until the winner stores its response, then return that body.
 * Null = Redis unavailable or the winner never stored — caller decides.
 */
export const claimOAuthRefreshReplay = async (
	key: string,
): Promise<{ body: Record<string, unknown> | null } | null> => {
	try {
		const miscRedis = getMiscRedis();

		for (let attempt = 0; attempt < CLAIM_MAX_ATTEMPTS; attempt++) {
			const value = await tryRedisOp({
				operation: () => miscRedis.get(key),
				source: "oauth-refresh-replay:read",
				redisInstance: miscRedis,
			});
			// undefined = Redis unavailable (vs null = key missing) — bail out.
			if (value === undefined) return null;

			if (value && value !== REFRESH_REPLAY_PENDING) {
				return {
					body: JSON.parse(decryptData(value)) as Record<string, unknown>,
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
				if (claimed === undefined) return null;
				if (claimed) return { body: null };
			}

			await timeout(CLAIM_POLL_MS);
		}
		return null;
	} catch {
		// Undecryptable/unparseable stored response — treat as unavailable.
		return null;
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
