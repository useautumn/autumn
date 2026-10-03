import { ErrCode } from "@autumn/shared";
import type { StripeLikeError } from "./isStripeError.js";

/** Stripe failures the merchant caused; server-specific route rules live in the server's errorMiddleware. */
export type StripeCallerErrorRule = {
	name: string;
	matches: (error: StripeLikeError) => boolean;
	context?: "new_stripe_key";
	message?: string;
	/** Set when the error is the caller's only on some request paths; never matches outside a request. */
	matchesPath?: (path: string) => boolean;
	statusCode: number;
	code: string;
};

const messageIncludes =
	(text: string): StripeCallerErrorRule["matches"] =>
	({ message }) =>
		message.includes(text);

/** Webhooks have no caller, and usage routes reach Stripe only as a billing side effect. */
const NON_CALLER_STRIPE_PATHS = [
	/^\/webhooks\//,
	/^\/v1\/(track|track_tokens|events|usage|check|entitled)$/,
	/^\/v1\/(balances|entities)[./]/,
	/^\/v1\/customers\/[^/]+\/(balances|entities)/,
];

const isCallerStripePath = (path: string) =>
	!NON_CALLER_STRIPE_PATHS.some((pattern) => pattern.test(path));

export const stripeCallerErrorRules: StripeCallerErrorRule[] = [
	{
		name: "invalid newly supplied Stripe key",
		context: "new_stripe_key",
		matches: ({ type, code, message }) => {
			const isInvalidKey =
				type === "StripeAuthenticationError" &&
				code === undefined &&
				message.startsWith("Invalid API Key provided:");
			const isPublishableKey =
				type === "StripePermissionError" && code === "secret_key_required";
			return isInvalidKey || isPublishableKey;
		},
		message: "Invalid Stripe secret key. Please provide a valid secret key.",
		statusCode: 400,
		code: ErrCode.StripeKeyInvalid,
	},
	{
		name: "rate limit exceeded",
		matches: ({ type, statusCode }) =>
			type === "StripeRateLimitError" || statusCode === 429,
		statusCode: 429,
		code: "stripe_rate_limit_exceeded",
	},
	{
		name: "resource missing",
		matches: ({ code }) => code === "resource_missing",
		matchesPath: isCallerStripePath,
		statusCode: 404,
		code: "stripe_resource_missing",
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
	{
		name: "trial ends within 2 days",
		matches: messageIncludes(
			"The `trial_end` date has to be at least 2 days in the future",
		),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "more than one discount",
		matches: messageIncludes(
			"Array discounts exceeded maximum 1 allowed elements",
		),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "cancellation details on a subscription not cancelling",
		matches: messageIncludes(
			"`cancellation_details` can only be set on subscriptions that are set to cancel",
		),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "coupon name over 40 characters",
		matches: ({ param, message }) =>
			param === "name" && message.includes("must be at most 40 characters"),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
	{
		name: "sent invoice without customer email",
		matches: messageIncludes(
			"In order to create invoices that are sent to the customer, the customer must have a valid email",
		),
		statusCode: 400,
		code: ErrCode.InvalidRequest,
	},
];
