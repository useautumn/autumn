import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { checkIdempotencyKey } from "@/internal/misc/idempotency/checkIdempotencyKey.js";

/**
 * Middleware that checks for idempotence in a request
 */
export const idempotencyMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const headers = c.req.header();
	const ctx = c.get("ctx");
	const idempotencyKey =
		headers["idempotency-key"] || headers["Idempotency-Key"];

	if (idempotencyKey) {
		await checkIdempotencyKey({
			orgId: ctx.org.id,
			env: ctx.env,
			idempotencyKey,
			logger: ctx.logger,
		});
	}

	await next();
};
