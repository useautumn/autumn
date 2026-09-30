import { RecaseError } from "@autumn/shared";
import { isStripeError } from "./isStripeError.js";
import { stripeCallerErrorRules } from "./stripeCallerErrorRules.js";

/** A merchant-caused Stripe error as the RecaseError the caller gets; undefined when the error is ours. */
export const stripeErrorToRecaseError = ({
	error,
}: {
	error: unknown;
}): RecaseError | undefined => {
	if (!isStripeError(error)) return;

	const rule = stripeCallerErrorRules.find((rule) => rule.matches(error));
	if (!rule) return;

	return new RecaseError({
		message: error.message,
		code: rule.code,
		statusCode: rule.statusCode,
	});
};
