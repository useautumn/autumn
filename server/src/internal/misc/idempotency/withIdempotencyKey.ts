import { ErrCode, type RouteGroup } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkIdempotencyKey } from "./actions/checkIdempotencyKey.js";
import { releaseIdempotencyKey } from "./actions/releaseIdempotencyKey.js";
import { resolveIdempotencyTtlMs } from "./resolveIdempotencyTtl.js";

export const shouldReleaseIdempotencyKeyForStatus = (status: number) =>
	status >= 400 && status !== 409;

const shouldReleaseIdempotencyKeyForError = (error: unknown) => {
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

	return (
		statusCode === null || shouldReleaseIdempotencyKeyForStatus(statusCode)
	);
};

export const withIdempotencyKey = async <T>({
	ctx,
	idempotencyKey,
	routeGroup = null,
	run,
	releaseOnSuccess,
}: {
	ctx: AutumnContext;
	idempotencyKey: string | null | undefined;
	routeGroup?: RouteGroup | null;
	run: () => Promise<T>;
	releaseOnSuccess?: (result: T) => boolean;
}): Promise<T> => {
	if (!idempotencyKey) return run();

	await checkIdempotencyKey({
		ctx,
		idempotencyKey,
		ttlMs: resolveIdempotencyTtlMs({ ctx, routeGroup }),
	});

	const release = () => releaseIdempotencyKey({ ctx, idempotencyKey });

	try {
		const result = await run();
		if (releaseOnSuccess?.(result)) {
			await release();
		}
		return result;
	} catch (error) {
		if (shouldReleaseIdempotencyKeyForError(error)) {
			await release();
		}

		throw error;
	}
};
