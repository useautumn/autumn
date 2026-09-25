import { isTransientDbError } from "@/db/dbUtils.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";

export const isRetryableFullSubjectRolloutError = ({
	error,
}: {
	error: unknown;
}) => isTransientRedisError({ error }) || isTransientDbError({ error });
