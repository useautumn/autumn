import type { ErrorClassification } from "../../models/errorClassification.js";
import { classifyRecaseError } from "../recase/classifyRecaseError.js";
import { isStripeError } from "./isStripeError.js";
import { stripeErrorToRecaseError } from "./stripeErrorToRecaseError.js";

/** Declines, insufficient funds, expired cards: the end customer's card, never our code. */
const isCardError = (error: unknown): boolean =>
	isStripeError(error) && error.type === "StripeCardError";

/** Stripe throttling us, unreachable, or failing on its side: clears on retry, so it alerts on rate. */
const TRANSIENT_STRIPE_TYPES = new Set([
	"StripeRateLimitError",
	"StripeConnectionError",
	"StripeAPIError",
]);

const isTransientStripeError = (error: unknown): boolean =>
	isStripeError(error) && TRANSIENT_STRIPE_TYPES.has(error.type);

/** Transient Stripe failures are infra; a merchant-caused one classifies like the RecaseError it's answered as; the rest are bugs. */
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
