import { formatZodError, stripeErrorToRecaseError } from "@autumn/errors";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import Stripe from "stripe";
import { ZodError } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

type StripeRouteErrorRule = {
	matches: (params: {
		err: Stripe.errors.StripeError;
		c: Context<HonoEnv>;
	}) => boolean;
	statusCode: ContentfulStatusCode;
};

/** Stripe failures that are the merchant's only on one route; route-free rules live in @autumn/errors. */
const stripeRouteErrorRules: StripeRouteErrorRule[] = [
	{
		matches: ({ err, c }) =>
			c.req.url.includes("/exchange") &&
			err.message.includes("Invalid API Key provided"),
		statusCode: 400,
	},
	{
		matches: ({ err, c }) =>
			c.req.url.includes("/billing_portal") &&
			err.message.includes("Provide a configuration or create your default"),
		statusCode: 404,
	},
	{
		matches: ({ err, c }) =>
			c.req.url.includes("/billing_portal") &&
			err.message.includes("Invalid URL: An explicit scheme (such as https)"),
		statusCode: 400,
	},
];

/** A ZodError before routeHandler marks the request validated came from the caller's input, not our code. */
const userInputZodErrorToRecaseError = ({
	err,
	c,
}: {
	err: Error;
	c: Context<HonoEnv>;
}): RecaseError | undefined => {
	const isUserInput = err instanceof ZodError && !c.get("validated");
	if (!isUserInput) return;

	return new RecaseError({
		message: formatZodError(err),
		code: ErrCode.InvalidInputs,
		statusCode: 400,
	});
};

const stripeRouteErrorToRecaseError = ({
	err,
	c,
}: {
	err: Error;
	c: Context<HonoEnv>;
}): RecaseError | undefined => {
	if (!(err instanceof Stripe.errors.StripeError)) return;

	const rule = stripeRouteErrorRules.find((rule) => rule.matches({ err, c }));
	if (!rule) return;

	return new RecaseError({
		message: err.message,
		code: ErrCode.InvalidRequest,
		statusCode: rule.statusCode,
	});
};

/** Caller mistakes that surface as third-party errors, answered as the RecaseError they really are. */
export const callerErrorToRecaseError = ({
	err,
	c,
}: {
	err: Error;
	c: Context<HonoEnv>;
}): Error =>
	userInputZodErrorToRecaseError({ err, c }) ??
	stripeRouteErrorToRecaseError({ err, c }) ??
	stripeErrorToRecaseError({ error: err }) ??
	err;
