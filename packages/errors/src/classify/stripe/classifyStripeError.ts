import type { ErrorClassification } from "../../models/errorClassification.js";
import { classifyRecaseError } from "../recase/classifyRecaseError.js";
import { isStripeError } from "./isStripeError.js";
import { stripeErrorToRecaseError } from "./stripeErrorToRecaseError.js";

const isCardError = (error: unknown): boolean =>
	isStripeError(error) && error.type === "StripeCardError";

const TRANSIENT_STRIPE_TYPES = new Set([
	"StripeRateLimitError",
	"StripeConnectionError",
	"StripeAPIError",
]);

const isTransientStripeError = (error: unknown): boolean =>
	isStripeError(error) && TRANSIENT_STRIPE_TYPES.has(error.type);

export const classifyStripeError = ({
	error,
}: {
	error: unknown;
}): ErrorClassification | undefined => {
	if (isTransientStripeError(error))
		return { kind: "infra", code: "stripe_unavailable" };
	const recaseError = stripeErrorToRecaseError({ error });
	if (recaseError) return classifyRecaseError({ error: recaseError });
	if (isCardError(error)) return { kind: "expected", code: "card_error" };
};
