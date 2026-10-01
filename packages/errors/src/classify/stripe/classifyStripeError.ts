import type { ErrorClassification } from "../../models/errorClassification.js";
import { classifyRecaseError } from "../recase/classifyRecaseError.js";
import { isStripeError } from "./isStripeError.js";
import { stripeErrorToRecaseError } from "./stripeErrorToRecaseError.js";

/** Declines, insufficient funds, expired cards: the end customer's card, never our code. */
const isCardError = (error: unknown): boolean =>
	isStripeError(error) && error.type === "StripeCardError";

/** A merchant-caused Stripe error classifies like the RecaseError it's answered as; the rest fall through to bug. */
export const classifyStripeError = ({
	error,
}: {
	error: unknown;
}): ErrorClassification | undefined => {
	const recaseError = stripeErrorToRecaseError({ error });
	if (recaseError) return classifyRecaseError({ error: recaseError });
	if (isCardError(error)) return { kind: "expected", code: "card_error" };
};
