import type { ErrorClassification } from "./errorClassification.js";

export type ErrorClassifier = ({
	error,
}: {
	error: unknown;
}) => ErrorClassification | undefined;
