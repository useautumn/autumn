import type { ErrorClassification } from "../models/errorClassification.js";
import { classifyRecaseError } from "./recase/classifyRecaseError.js";
import { classifyStripeError } from "./stripe/classifyStripeError.js";

/** Ordered: the first classifier that recognises the error decides its kind. */
const classifiers = [classifyRecaseError, classifyStripeError];

const errorCodeOf = (error: unknown): string | undefined => {
	if (!(error instanceof Error) || !("code" in error)) return;
	return typeof error.code === "string" ? error.code : undefined;
};

/** Type-based only: whoever threw the error decided its kind; unrecognised errors are bugs. */
export const classifyError = ({
	error,
}: {
	error: unknown;
}): ErrorClassification => {
	for (const classify of classifiers) {
		const classification = classify({ error });
		if (classification) return classification;
	}
	return { kind: "bug", code: errorCodeOf(error) };
};
