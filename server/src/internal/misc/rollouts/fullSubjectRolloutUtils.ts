import { isTransientDbError } from "@/db/dbUtils.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";
import type { AutumnContext, RolloutSnapshot } from "@/honoUtils/HonoEnv.js";

export const FULL_SUBJECT_ROLLOUT_ID = "v2-cache";

export const isFullSubjectRolloutEnabled = ({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean =>
	ctx.rolloutSnapshot?.rolloutId === FULL_SUBJECT_ROLLOUT_ID &&
	ctx.rolloutSnapshot.enabled;

export const getFullSubjectRolloutSnapshot = ({
	ctx,
}: {
	ctx: AutumnContext;
}): RolloutSnapshot | undefined =>
	ctx.rolloutSnapshot?.rolloutId === FULL_SUBJECT_ROLLOUT_ID
		? ctx.rolloutSnapshot
		: undefined;

export const isRetryableFullSubjectRolloutError = ({
	error,
}: {
	error: unknown;
}) => isTransientRedisError({ error }) || isTransientDbError({ error });
