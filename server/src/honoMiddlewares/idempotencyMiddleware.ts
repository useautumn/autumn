import { ErrCode } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	checkIdempotencyKey,
	releaseIdempotencyKey,
} from "@/internal/misc/idempotency/checkIdempotencyKey.js";

const shouldReleaseStatus = (status: number) =>
	status >= 400 && status < 500 && status !== 409;

const shouldReleaseError = (error: unknown) => {
	const statusCode =
		typeof error === "object" && error !== null && "statusCode" in error
			? Number(error.statusCode)
			: null;
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: null;

	return (
		statusCode !== null &&
		shouldReleaseStatus(statusCode) &&
		code !== ErrCode.DuplicateIdempotencyKey
	);
};

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

	try {
		await next();
	} catch (error) {
		if (idempotencyKey && shouldReleaseError(error)) {
			await releaseIdempotencyKey({
				orgId: ctx.org.id,
				env: ctx.env,
				idempotencyKey,
			});
		}

		throw error;
	}

	if (idempotencyKey && shouldReleaseStatus(c.res.status)) {
		await releaseIdempotencyKey({
			orgId: ctx.org.id,
			env: ctx.env,
			idempotencyKey,
		});
	}
};
