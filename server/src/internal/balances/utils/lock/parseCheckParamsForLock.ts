import { generateKsuid } from "@autumn/ksuid";
import {
	type CheckParams,
	ErrCode,
	type ParsedCheckParams,
	type ParsedLockParams,
	RecaseError,
} from "@autumn/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const parseCheckParamsForLock = ({
	params,
}: {
	params: CheckParams;
}): ParsedCheckParams => {
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
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (
		lock.expires_at !== undefined &&
		lock.expires_at > Date.now() + ONE_DAY_MS
	) {
		throw new RecaseError({
			message: "Lock expires_at cannot be more than 1 day from now",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const lockKey = lock.key ?? generateKsuid({ prefix: "lck" });
	const hashedKey = Bun.hash(lockKey).toString();

	console.log("Hashed key:", hashedKey);

	const finalLock: ParsedLockParams = {
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
