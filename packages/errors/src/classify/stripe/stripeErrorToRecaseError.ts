import { RecaseError } from "@autumn/shared";
import { isStripeError } from "./isStripeError.js";
import {
	type StripeCallerErrorRule,
	stripeCallerErrorRules,
} from "./stripeCallerErrorRules.js";

/** A merchant-caused Stripe error as the RecaseError the caller gets; undefined when the error is ours. */
export const stripeErrorToRecaseError = ({
	error,
	path,
	context,
}: {
	error: unknown;
	/** The request path, when the error reached a route's error boundary. */
	path?: string;
	context?: StripeCallerErrorRule["context"];
}): RecaseError | undefined => {
	if (!isStripeError(error)) return;

	const rule = stripeCallerErrorRules.find(
		(rule) =>
			rule.context === context &&
			rule.matches(error) &&
			(!rule.matchesPath || (path !== undefined && rule.matchesPath(path))),
	);
	if (!rule) return;

	return new RecaseError({
		message: rule.message ?? error.message,
		code: rule.code,
		statusCode: rule.statusCode,
	});
};
