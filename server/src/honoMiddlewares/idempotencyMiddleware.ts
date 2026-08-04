import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	shouldReleaseIdempotencyKeyForStatus,
	withIdempotencyKey,
} from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { getRouteGroup } from "./routeGroupRegistry.js";

export const idempotencyMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const headers = c.req.header();
	const ctx = c.get("ctx");
	const idempotencyKey =
		headers["idempotency-key"] || headers["Idempotency-Key"];

	await withIdempotencyKey({
		ctx,
		idempotencyKey,
		routeGroup: getRouteGroup(c),
		run: next,
		// A 4xx/5xx response (except 409) is retryable — free the key.
		releaseOnSuccess: () => shouldReleaseIdempotencyKeyForStatus(c.res.status),
	});
};
