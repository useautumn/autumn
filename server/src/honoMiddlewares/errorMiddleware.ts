import { ErrCode, RecaseError as SharedRecaseError } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import Stripe from "stripe";
import { ZodError } from "zod/v4";
import { formatZodError } from "@/errors/formatZodError.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import RecaseError from "@/utils/errorUtils.js";
import { handleErrorSkip } from "./errorSkipMiddleware.js";
/**
 * Hono error handler middleware
 * Handles different error types and responds appropriately with proper logging
 */
export const errorMiddleware = (err: Error, c: Context<HonoEnv>) => {
	const ctx = c.get("ctx");
	const logger = ctx?.logger;

	// If no context/logger available, fallback to console
	if (!logger) {
		console.error("Error occurred before context was set:", err);
		Sentry.captureException(err);
		return c.json(
			{
				message: "Internal server error",
				code: ErrCode.InternalError,
			},
			500,
		);
	}

	// Check for error skip cases first (warn-level errors that don't need Sentry)
	const skipResponse = handleErrorSkip(err, c);
	if (skipResponse) return skipResponse;

	// If we got here, it's an error worth tracking - capture to Sentry
	Sentry.captureException(err);

	// 1. Handle RecaseError (our custom errors)
	if (err instanceof RecaseError || err instanceof SharedRecaseError) {
		logger.warn(
			`RECASE WARNING (${ctx.org?.slug || "unknown"}): ${err.message} [${err.code}]`,
			{
				error: err.data ?? err,
			},
		);

		return c.json(
			{
				message: err.message,
				code: err.code,
				env: ctx.env,
			},
			err.statusCode as ContentfulStatusCode,
		);
	}

	// 2. Handle Stripe errors
	if (err instanceof Stripe.errors.StripeError) {
		logger.error(
			`STRIPE ERROR (${ctx.org?.slug || "unknown"}): ${err.message}`,
			{
				error: {
					type: err.type,
					code: err.code,
					statusCode: err.statusCode,
				},
			},
		);

		return c.json(
			{
				message: `(Stripe Error) ${err.message}`,
				code: ErrCode.StripeError,
				env: ctx.env,
			},
			400,
		);
	}

	// 3. Handle Zod validation errors
	// Note: User input validation errors are already handled by errorSkipMiddleware
	// If we get here, it's an internal Zod error (bug in our code)
	if (err instanceof ZodError) {
		const formattedError = formatZodError(err);

		logger.error(
			`INTERNAL ZOD ERROR (${ctx.org?.slug || "unknown"}): ${formattedError}`,
		);
		logger.error(err);

		return c.json(
			{
				message: formattedError,
				code: ErrCode.InvalidInputs,
				env: ctx.env,
			},
			500,
		);
	}

	// 4. Handle unknown errors
	logger.error(
		`UNKNOWN ERROR (${ctx.org?.slug || "unknown"}): ${err.message}`,
		{
			error: {
				stack: err.stack,
				message: err.message,
			},
		},
	);

	return c.json(
		{
			message: err.message || "Unknown error",
			code: ErrCode.InternalError,
			env: ctx.env,
		},
		500,
	);
};
