import type { ErrorClassification } from "../../models/errorClassification.js";
import { classifyRecaseError } from "../recase/classifyRecaseError.js";
import { stripeErrorToRecaseError } from "./stripeErrorToRecaseError.js";

/** A merchant-caused Stripe error classifies like the RecaseError it's answered as; the rest fall through to bug. */
export const classifyStripeError = ({
	error,
}: {
	error: unknown;
}): ErrorClassification | undefined => {
	const recaseError = stripeErrorToRecaseError({ error });
	if (!recaseError) return;
	return classifyRecaseError({ error: recaseError });
};
