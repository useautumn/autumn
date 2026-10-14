import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import { timeout } from "@/utils/genUtils.js";

const REFRESH_REPLAY_TTL_SECONDS = 30;
const REFRESH_REPLAY_PENDING = "pending";
const CLAIM_MAX_ATTEMPTS = 200;
const CLAIM_POLL_MS = 25;

export const buildOAuthRefreshReplayKey = (requestFingerprint: string) =>
	`oauth:refresh-replay:${requestFingerprint}`;

export type OAuthRefreshReplayClaim = {
	body: Record<string, unknown> | null;
	holdsKey: boolean;
};

const NO_KEY_HELD: OAuthRefreshReplayClaim = {
	body: null,
	holdsKey: false,
};

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
		return NO_KEY_HELD;
	}
};

export const releaseOAuthRefreshReplay = async (key: string): Promise<void> => {
	try {
		const miscRedis = getMiscRedis();
		await tryRedisOp({
			operation: () => miscRedis.del(key),
			source: "oauth-refresh-replay:release",
			redisInstance: miscRedis,
		});
	} catch {}
};

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
	} catch {}
};
