import { timeout } from "@/utils/genUtils.js";
import {
	acquireLock,
	DEFAULT_LOCK_ERROR_MESSAGE,
	isLockConflict,
	lockConflictError,
} from "./acquireLock.js";

export const acquireLockWithWait = async ({
	lockKey,
	ttlMs,
	token,
	maxWaitMs,
	retryMs = 250,
	retryJitterMs = 0,
	errorMessage = DEFAULT_LOCK_ERROR_MESSAGE,
	failOpen = true,
}: {
	lockKey: string;
	ttlMs: number;
	token: string;
	maxWaitMs: number;
	retryMs?: number;
	retryJitterMs?: number;
	errorMessage?: string;
	failOpen?: boolean;
}): Promise<void> => {
	const waitDeadline = Date.now() + maxWaitMs;

	while (true) {
		try {
			await acquireLock({ lockKey, ttlMs, token, errorMessage, failOpen });
			return;
		} catch (error) {
			if (!isLockConflict(error)) throw error;
			if (Date.now() >= waitDeadline) throw lockConflictError(errorMessage);
		}

		await timeout(retryMs + Math.floor(Math.random() * retryJitterMs));
	}
};
