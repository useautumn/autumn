import { ErrCode, RecaseError as SharedRecaseError } from "@autumn/shared";
import * as Sentry from "@sentry/node";
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

	Sentry.captureException(err);

	// If no context/logger available, fallback to console
	if (!logger) {
		console.error("Error occurred before context was set:", err);
		return c.json(
			{
				message: "Internal server error",
				code: ErrCode.InternalError,
			},
			500,
		);
	}

	// Check for error skip cases first (warn-level errors)
	const skipResponse = handleErrorSkip(err, c);
	if (skipResponse) return skipResponse;

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

	if (err instanceof ZodError) {
		const formattedError = formatZodError(err);

		// 1. If it's validation error
		if (c.get("validated")) {
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
		} else {
			logger.warn(
				`ZOD ERROR (${ctx.org?.slug || "unknown"}): ${formattedError}`,
			);

			return c.json(
				{
					message: formattedError,
					code: ErrCode.InvalidInputs,
					env: ctx.env,
				},
				400,
			);
		}
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
