import { ErrCode, type TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	checkIdempotencyKey,
	releaseIdempotencyKey,
} from "@/internal/misc/idempotency/checkIdempotencyKey.js";

const shouldReleaseStatus = (status: number) => status >= 400 && status !== 409;

const shouldReleaseError = (error: unknown) => {
	const statusCode =
		typeof error === "object" && error !== null && "statusCode" in error
			? Number(error.statusCode)
			: null;
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: null;

	if (code === ErrCode.DuplicateIdempotencyKey || statusCode === 409) {
		return false;
	}

	return statusCode === null || shouldReleaseStatus(statusCode);
};

const getTrackBodyIdempotencyKey = ({ body }: { body: TrackParams }) =>
	body.idempotency_key ? `track:${body.idempotency_key}` : null;

export const withTrackBodyIdempotency = async <T>({
	ctx,
	body,
	run,
	releaseOnSuccess,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	run: () => Promise<T>;
	releaseOnSuccess?: (result: T) => boolean;
}): Promise<T> => {
	const idempotencyKey = getTrackBodyIdempotencyKey({ body });
	if (!idempotencyKey) return run();

	await checkIdempotencyKey({
		orgId: ctx.org.id,
		env: ctx.env,
		idempotencyKey,
		logger: ctx.logger,
	});

	try {
		const result = await run();
		if (releaseOnSuccess?.(result)) {
			await releaseIdempotencyKey({
				orgId: ctx.org.id,
				env: ctx.env,
				idempotencyKey,
			});
		}
		return result;
	} catch (error) {
		if (shouldReleaseError(error)) {
			await releaseIdempotencyKey({
				orgId: ctx.org.id,
				env: ctx.env,
				idempotencyKey,
			});
		}

		throw error;
	}
};
