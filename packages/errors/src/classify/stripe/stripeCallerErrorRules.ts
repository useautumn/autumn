import { ErrCode } from "@autumn/shared";
import type { StripeLikeError } from "./isStripeError.js";

/** Stripe failures the merchant caused, on any route; route-scoped ones live in the server's errorMiddleware. */
type StripeCallerErrorRule = {
	name: string;
	matches: (error: StripeLikeError) => boolean;
	statusCode: number;
	code: string;
};

const messageIncludes =
	(text: string): StripeCallerErrorRule["matches"] =>
	({ message }) =>
		message.includes(text);

export const stripeCallerErrorRules: StripeCallerErrorRule[] = [
	{
		name: "rate limit exceeded",
		matches: ({ type, statusCode }) =>
			type === "StripeRateLimitError" || statusCode === 429,
		statusCode: 429,
		code: "stripe_rate_limit_exceeded",
	},
	{
		name: "card declined",
		matches: messageIncludes("Your card was declined."),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "org has production customers",
		matches: messageIncludes(
			"Cannot delete org with production mode customers",
		),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "webhook endpoint limit",
		matches: messageIncludes(
			"You have reached the maximum of 16 test webhook endpoints",
		),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "URL without scheme",
		matches: messageIncludes(
			"Invalid URL: An explicit scheme (such as https) must be provided",
		),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "invalid URL",
		matches: messageIncludes("Not a valid URL"),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
];
