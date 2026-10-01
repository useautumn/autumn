import type { ErrorClassification } from "../models/errorClassification.js";
import type { ErrorClassifier } from "../models/errorClassifier.js";
import { classifyRecaseError } from "./recase/classifyRecaseError.js";
import { classifyStripeError } from "./stripe/classifyStripeError.js";

/** Ordered: the first classifier that recognises the error decides its kind. */
const builtInClassifiers: ErrorClassifier[] = [
	classifyRecaseError,
	classifyStripeError,
];

const errorCodeOf = (error: unknown): string | undefined => {
	if (!(error instanceof Error) || !("code" in error)) return;
	return typeof error.code === "string" ? error.code : undefined;
};

/** Type-based only: whoever threw the error decided its kind; unrecognised errors are bugs. App classifiers run first. */
export const classifyError = ({
	error,
	classifiers = [],
}: {
	error: unknown;
	classifiers?: ErrorClassifier[];
}): ErrorClassification => {
	for (const classify of [...classifiers, ...builtInClassifiers]) {
		const classification = classify({ error });
		if (classification) return classification;
	}
	return { kind: "bug", code: errorCodeOf(error) };
};
