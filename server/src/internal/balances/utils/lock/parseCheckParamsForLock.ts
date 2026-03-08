import { generateKsuid } from "@autumn/ksuid";
import { type CheckParams, type LockParams, RecaseError } from "@autumn/shared";

export const parseCheckParamsForLock = ({
	params,
}: {
	params: CheckParams;
}) => {
	const { lock } = params;
	if (!lock?.enabled) {
		return {
			...params,
			lock: undefined,
		};
	}

	if (lock.key && lock.key.length > 256) {
		throw new RecaseError({
			message: "Lock key cannot exceed 256 characters",
		});
	}

	const lockKey = lock.key ?? generateKsuid({ prefix: "lck" });
	const hashedKey = Bun.hash(lockKey).toString();

	const finalLock: LockParams = {
		enabled: true,
		key: lockKey,
		hashed_key: hashedKey,
		expires_at: lock.expires_at ?? undefined,
	};

	return {
		...params,
		lock: finalLock,
	};
};
