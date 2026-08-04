import { ErrCode, RecaseError } from "@autumn/shared";
import { getMiscRedis } from "@/external/redis/initRedis.js";

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

/**
 * Claim a distributed lock via SET NX. Throws a 423 on conflict (with the
 * HOLDER's errorMessage when readable, so contenders see what's running).
 *
 * `failOpen` (default) treats Redis unavailability as "proceed unlocked" —
 * right for short request-path locks where blocking every request on a Redis
 * outage is worse than a rare race. Pass `failOpen: false` for long exclusive
 * operations (e.g. migrations) that must never run concurrently.
 */
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
		const result = await redis.set(
			lockKey,
			JSON.stringify(lockData),
			"PX",
			ttlMs,
			"NX",
		);

		// If result is null, lock already exists (NX failed)
		if (result === null) {
			conflict = true;
			const existingData = await redis.get(lockKey);
			const parsed = existingData
				? (JSON.parse(existingData) as LockData)
				: null;

			throw lockConflictError(parsed?.errorMessage || errorMessage);
		}

		return true;
	} catch (error) {
		if (error instanceof RecaseError) throw error;

		// A known conflict must stay a conflict even if reading its message failed
		if (conflict) throw lockConflictError(errorMessage);

		if (failOpen) return true;
		throw error;
	}
};
