import { ErrCode, RecaseError } from "@autumn/shared";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { mirrorSetOnMiscRedisRampTarget } from "@/external/redis/miscCache/setOnMiscRedisTargets.js";

export interface LockData {
	errorMessage: string;
	token?: string;
}

export const DEFAULT_LOCK_ERROR_MESSAGE =
	"Operation already in progress, try again in a few seconds";

export const lockConflictError = (errorMessage: string) =>
	new RecaseError({
		message: errorMessage,
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});

export const isLockConflict = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === ErrCode.LockAlreadyExists;

export const acquireLock = async ({
	lockKey,
	ttlMs = 10000,
	errorMessage = DEFAULT_LOCK_ERROR_MESSAGE,
	token,
	failOpen = true,
}: {
	lockKey: string;
	ttlMs?: number;
	errorMessage?: string;
	token?: string;
	failOpen?: boolean;
}): Promise<boolean> => {
	const redis = getMiscRedis();

	if (redis.status !== "ready") {
		if (failOpen) return true;
		throw new RecaseError({
			message: "Redis unavailable — cannot acquire lock",
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}

	let conflict = false;
	try {
		const lockData: LockData = { errorMessage, token };
		const serializedLockData = JSON.stringify(lockData);
		const result = await redis.set(
			lockKey,
			serializedLockData,
			"PX",
			ttlMs,
			"NX",
		);

		if (result === null) {
			conflict = true;
			const existingData = await redis.get(lockKey);
			const parsed = existingData
				? (JSON.parse(existingData) as LockData)
				: null;

			throw lockConflictError(parsed?.errorMessage || errorMessage);
		}

		void mirrorSetOnMiscRedisRampTarget({
			key: lockKey,
			value: serializedLockData,
			ttlMs,
			source: "lock:mirror",
		});

		return true;
	} catch (error) {
		if (error instanceof RecaseError) throw error;

		if (conflict) throw lockConflictError(errorMessage);

		if (failOpen) return true;
		throw error;
	}
};
