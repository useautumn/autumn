import { AutumnError, ErrCode } from "@autumn/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import Stripe from "stripe";
import { ZodError } from "zod/v4";
import type { HonoEnv } from "@/initHono.js";
import RecaseError, { formatZodError } from "@/utils/errorUtils.js";

/**
 * Handle special error cases that should use warn instead of error logging
 * Returns a response if the error matches a special case, null otherwise
 */
const handleSpecialErrorCases = (
	err: Error,
	c: Context<HonoEnv>,
	ctx: any,
	logger: any,
) => {
	const url = c.req.url;

	// Special case 1: EntityNotFound - use warn instead of error
	if (err instanceof RecaseError && err.code === ErrCode.EntityNotFound) {
		logger.warn(`${err.message}, org: ${ctx.org?.slug || "unknown"}`);
		return c.json(
			{
				message: err.message,
				code: err.code,
				env: ctx.env,
			},
			404,
		);
	}

	// Special case 2: Stripe exchange router invalid API key
	if (
		err instanceof Stripe.errors.StripeError &&
		url.includes("/exchange") &&
		err.message.includes("Invalid API Key provided")
	) {
		logger.warn("Exchange router, invalid API Key provided");
		return c.json(
			{
				message: err.message,
				code: ErrCode.InvalidRequest,
				env: ctx.env,
			},
			400,
		);
	}

	// Special case 3: Billing portal config error
	if (
		err instanceof Stripe.errors.StripeError &&
		url.includes("/billing_portal") &&
		err.message.includes("Provide a configuration or create your default")
	) {
		logger.warn(`Billing portal config error, org: ${ctx.org?.slug}`);
		return c.json(
			{
				message: err.message,
				code: ErrCode.InvalidRequest,
				env: ctx.env,
			},
			404,
		);
	}

	// Special case 4: Billing portal return_url error
	if (
		err instanceof Stripe.errors.StripeError &&
		url.includes("/billing_portal") &&
		err.message.includes("Invalid URL: An explicit scheme (such as https)")
	) {
		logger.warn(`Billing portal return_url error, org: ${ctx.org?.slug}`);
		return c.json(
			{
				message: err.message,
				code: ErrCode.InvalidRequest,
				env: ctx.env,
			},
			400,
		);
	}

	// Special case 5: Zod error on /attach - convert to RecaseError
	if (err instanceof ZodError && url.includes("/attach")) {
		const formattedError = formatZodError(err);
		logger.warn(
			`ATTACH ZOD ERROR (${ctx.org?.slug || "unknown"}): ${formattedError}`,
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

	// No special case matched
	return null;
};

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
		return c.json(
			{
				message: "Internal server error",
				code: ErrCode.InternalError,
			},
			500,
		);
	}

	// Check for special error cases first
	const specialCaseResponse = handleSpecialErrorCases(err, c, ctx, logger);
	if (specialCaseResponse) return specialCaseResponse;

	// 1. Handle RecaseError (our custom errors)
	if (err instanceof RecaseError || err instanceof AutumnError) {
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

		logger.error(
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
