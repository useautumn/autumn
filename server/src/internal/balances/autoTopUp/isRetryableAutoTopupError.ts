import { ErrCode } from "@autumn/shared";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";

export const isRetryableAutoTopupError = ({ error }: { error: unknown }) =>
	(error as { code?: string } | null)?.code === ErrCode.LockAlreadyExists ||
	isTransientRedisError({ error });
