import type { ErrorClassification } from "./errorClassification.js";

/** Returns a classification for errors it recognises, `undefined` to defer to the next classifier. */
export type ErrorClassifier = ({
	error,
}: {
	error: unknown;
}) => ErrorClassification | undefined;
