import { isRetryableDbError } from "@/db/dbUtils.js";
import type { AutumnContext, RolloutSnapshot } from "@/honoUtils/HonoEnv.js";

export const FULL_SUBJECT_ROLLOUT_ID = "v2-cache";
const RETRYABLE_REDIS_ERROR_NAMES = new Set(["MaxRetriesPerRequestError"]);

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
}) =>
	isRetryableDbError({ error }) ||
	(error instanceof Error &&
		(RETRYABLE_REDIS_ERROR_NAMES.has(error.name) ||
			error.message === "Command timed out"));
