import { formatZodError, reportError } from "@autumn/errors";
import { type AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import Stripe from "stripe";
import { ZodError } from "zod/v4";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { callerErrorToRecaseError } from "./callerErrorToRecaseError.js";

/** The API's error contract; bodies are unchanged from before @autumn/errors. */
const errorToResponse = ({
	c,
	error,
	env,
}: {
	c: Context<HonoEnv>;
	error: Error;
	env: AppEnv;
}) => {
	if (error instanceof RecaseError) {
		if (error.statusCode === 503) c.header("Retry-After", "1");
		return c.json(
			{
				message: error.message,
				code: error.code,
				env,
				...(error.details ? { details: error.details } : {}),
			},
			error.statusCode as ContentfulStatusCode,
		);
	}

	if (error instanceof Stripe.errors.StripeError) {
		return c.json(
			{
				message: `(Stripe Error) ${error.message}`,
				code: ErrCode.StripeError,
				env,
			},
			400,
		);
	}

	if (error instanceof ZodError) {
		return c.json(
			{ message: formatZodError(error), code: ErrCode.InvalidInputs, env },
			500,
		);
	}

	return c.json(
		{
			message: error.message || "Unknown error",
			code: ErrCode.InternalError,
			env,
		},
		500,
	);
};

/** Hono's error boundary: report through @autumn/errors, then answer with the API's error contract. */
export const errorMiddleware = (err: Error, c: Context<HonoEnv>) => {
	const ctx = c.get("ctx");
	const error = callerErrorToRecaseError({ err, c });

	reportError({
		ctx: ctx?.logger ? ctx : { logger },
		error,
		operation: `${c.req.method} ${c.req.routePath}`,
	});

	if (!ctx?.logger) {
		return c.json(
			{ message: "Internal server error", code: ErrCode.InternalError },
			500,
		);
	}
	return errorToResponse({ c, error, env: ctx.env });
};
