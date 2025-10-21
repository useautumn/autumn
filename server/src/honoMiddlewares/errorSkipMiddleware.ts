import {
	CusErrorCode,
	ErrCode,
	ProductErrorCode,
	RecaseError as SharedRecaseError,
} from "@autumn/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import Stripe from "stripe";
import { ZodError } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { matchRoute } from "./middlewareUtils.js";

// ============================================================================
// ERROR SKIP CONFIGURATION
// ============================================================================

/**
 * Simple route-based error code skipping
 * Add routes here to skip specific error codes (logged as warnings, returns appropriate status)
 */
const ROUTE_ERROR_SKIP_MAP = [
	// {
	// 	route: "/products/:productId/count",
	// 	method: "GET",
	// 	skipErrorCodes: [ProductErrorCode.ProductNotFound],
	// },
	{
		route: "/customers/:customer_id/aksdjnalksjnd",
		method: "GET",
		skipErrorCodes: [ErrCode.CustomerNotFound],
	},
] as const;

/** Global error codes that should be logged as warnings instead of errors (all routes) */
const GLOBAL_WARN_ERROR_CODES: string[] = [
	ProductErrorCode.ProductNotFound,
	CusErrorCode.CustomerNotFound,
	ErrCode.CustomerNotFound,
	ErrCode.EntityNotFound,
];

/** Advanced route-specific error handling rules (for complex matching logic) */
const ROUTE_SPECIFIC_RULES: Array<{
	name: string;
	match: (err: Error, c: Context<HonoEnv>) => boolean;
	statusCode: ContentfulStatusCode;
}> = [];

/** Stripe-specific error handling rules */
const STRIPE_RULES = [
	{
		name: "Exchange router invalid API key",
		match: (err: Error, c: Context<HonoEnv>) =>
			err instanceof Stripe.errors.StripeError &&
			c.req.url.includes("/exchange") &&
			err.message.includes("Invalid API Key provided"),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "Billing portal config error",
		match: (err: Error, c: Context<HonoEnv>) =>
			err instanceof Stripe.errors.StripeError &&
			c.req.url.includes("/billing_portal") &&
			err.message.includes("Provide a configuration or create your default"),
		statusCode: 404,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "Billing portal return_url error",
		match: (err: Error, c: Context<HonoEnv>) =>
			err instanceof Stripe.errors.StripeError &&
			c.req.url.includes("/billing_portal") &&
			err.message.includes("Invalid URL: An explicit scheme (such as https)"),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
] as const;

/** Zod-specific error handling rules */
const ZOD_RULES = [
	{
		name: "Zod error on /attach",
		match: (err: Error, c: Context<HonoEnv>) =>
			err instanceof ZodError && c.req.url.includes("/attach"),
		statusCode: 400,
		format: (err: ZodError) => formatZodError(err),
	},
] as const;

const createErrorResponse = ({
	c,
	ctx,
	message,
	code,
	statusCode,
}: {
	c: Context<HonoEnv>;
	ctx: any;
	message: string;
	code: string;
	statusCode: ContentfulStatusCode;
}) => {
	return c.json(
		{
			message,
			code,
			env: ctx.env,
		},
		statusCode,
	);
};

/**
 * Handles special error cases that should use warn logging instead of error logging.
 * Returns a response if handled, null otherwise to continue to main error handler.
 */
export const handleErrorSkip = (err: Error, c: Context<HonoEnv>) => {
	const ctx = c.get("ctx");
	const logger = ctx?.logger;

	if (!logger) {
		return null; // Let main error handler deal with this
	}

	// 1. Check route-based error code skipping (simplest case)
	if (err instanceof RecaseError || err instanceof SharedRecaseError) {
		const pathname = new URL(c.req.url).pathname;

		for (const skipRule of ROUTE_ERROR_SKIP_MAP) {
			if (
				skipRule.skipErrorCodes.includes(err.code as any) &&
				matchRoute({
					url: pathname,
					method: c.req.method,
					pattern: { url: skipRule.route, method: skipRule.method },
				})
			) {
				logger.warn(
					`${err.message}, org: ${ctx.org?.slug || "unknown"} [route skip: ${skipRule.route}]`,
				);
				return createErrorResponse({
					c,
					ctx,
					message: err.message,
					code: err.code,
					statusCode: 404,
				});
			}
		}
	}

	// 2. Check global warn-level error codes
	if (
		(err instanceof RecaseError || err instanceof SharedRecaseError) &&
		GLOBAL_WARN_ERROR_CODES.includes(err.code)
	) {
		logger.warn(
			`${err.message}, org: ${ctx.org?.slug || "unknown"}, path: ${c.req.path}`,
		);
		return createErrorResponse({
			c,
			ctx,
			message: err.message,
			code: err.code,
			statusCode: 404,
		});
	}

	// 3. Check advanced route-specific rules
	for (const rule of ROUTE_SPECIFIC_RULES) {
		if (rule.match(err, c)) {
			const recaseErr = err as RecaseError;
			logger.warn(`${recaseErr.message}, org: ${ctx.org?.slug || "unknown"}`);
			return createErrorResponse({
				c,
				ctx,
				message: recaseErr.message,
				code: recaseErr.code,
				statusCode: rule.statusCode,
			});
		}
	}

	// 4. Check Stripe-specific rules
	for (const rule of STRIPE_RULES) {
		if (rule.match(err, c)) {
			const stripeErr = err as Stripe.errors.StripeError;
			logger.warn(`${rule.name}, org: ${ctx.org?.slug || "unknown"}`);
			return createErrorResponse({
				c,
				ctx,
				message: stripeErr.message,
				code: rule.code,
				statusCode: rule.statusCode,
			});
		}
	}

	// 5. Check Zod-specific rules
	for (const rule of ZOD_RULES) {
		if (rule.match(err, c)) {
			const zodErr = err as ZodError;
			const formattedError = rule.format(zodErr);
			logger.warn(
				`ZOD ERROR (${ctx.org?.slug || "unknown"}): ${formattedError}`,
			);
			return createErrorResponse({
				c,
				ctx,
				message: formattedError,
				code: ErrCode.InvalidInputs,
				statusCode: rule.statusCode,
			});
		}
	}

	// No special case matched - continue to main error handler
	return null;
};

/**
 * Middleware wrapper for error skip handling
 * Note: This doesn't actually prevent errors from reaching onError handler
 * It's used within the main error handler to check for skip cases
 */
export const errorSkipMiddleware = (err: Error, c: Context<HonoEnv>) => {
	return handleErrorSkip(err, c);
};
