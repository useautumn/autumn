import { ApiVersion } from "@autumn/shared";
import type { RateLimitRequestCtx } from "./types/rateLimitRequestCtx";

// Runs before validation, so it reads the raw body defensively.
const requestBodyOf = ({ ctx }: { ctx: RateLimitRequestCtx }) =>
	ctx.requestBody && typeof ctx.requestBody === "object"
		? (ctx.requestBody as Record<string, unknown>)
		: {};

const hasSyncWriteLimits = ({ ctx }: { ctx: RateLimitRequestCtx }) =>
	ctx.apiVersion?.gte(ApiVersion.V2_5) === true;

/** A 2.5+ track that applies before responding instead of queueing. */
export const isSyncTrackRequest = ({ ctx }: { ctx: RateLimitRequestCtx }) =>
	hasSyncWriteLimits({ ctx }) && requestBodyOf({ ctx }).async === false;

/** A 2.5+ check that writes a balance: a lock or send_event. */
export const isWritingCheckRequest = ({
	ctx,
}: {
	ctx: RateLimitRequestCtx;
}) => {
	const body = requestBodyOf({ ctx });
	const lock = body.lock as { enabled?: unknown } | undefined;
	return (
		hasSyncWriteLimits({ ctx }) &&
		(lock?.enabled === true || body.send_event === true)
	);
};
