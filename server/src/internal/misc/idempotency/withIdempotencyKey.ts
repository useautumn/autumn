import { ErrCode, type RouteGroup } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkIdempotencyKey } from "./actions/checkIdempotencyKey.js";
import { releaseIdempotencyKey } from "./actions/releaseIdempotencyKey.js";
import { resolveIdempotencyTtlMs } from "./resolveIdempotencyTtl.js";

export const shouldReleaseIdempotencyKeyForStatus = (status: number) =>
	status >= 400 && status !== 409;

/** Releases on failures a client should be able to retry: unknown errors
 *  (no statusCode — the request never completed) and non-409 4xx/5xx.
 *  Never releases duplicates — that would defeat the key. */
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

/** Wraps `run` in an idempotency-key claim: duplicate → 409 before running,
 *  retryable failure → key released so the client can retry. Shared by the
 *  Idempotency-Key header middleware and track's body-level key. */
export const withIdempotencyKey = async <T>({
	ctx,
	idempotencyKey,
	routeGroup = null,
	run,
	releaseOnSuccess,
}: {
	ctx: AutumnContext;
	/** The idempotency key to claim in it's raw form, not hashed. */
	idempotencyKey: string | null | undefined;
	/** Route group whose org-configured TTL applies; null → 24h default. */
	routeGroup?: RouteGroup | null;
	run: () => Promise<T>;
	/** Release the key even though `run` resolved (e.g. the work was handed
	 *  off for a replay, or the response status is a retryable failure). */
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
