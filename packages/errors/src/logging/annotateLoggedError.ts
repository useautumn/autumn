import { errorToObject } from "@autumn/logging";
import type { ErrorClassification } from "../models/errorClassification.js";
import type { LoggedError } from "./findLoggedError.js";

const errorDataOf = (error: Error): unknown =>
	"data" in error ? error.data : undefined;

/** Replaces the raw Error with what Axiom indexes: kind and code inside the existing `error` field. */
export const annotateLoggedError = ({
	args,
	loggedError,
	classification,
}: {
	args: unknown[];
	loggedError: LoggedError;
	classification: ErrorClassification;
}): unknown[] => {
	const { error, argIndex, key } = loggedError;
	const annotatedError = {
		kind: classification.kind,
		code: classification.code,
		...errorToObject(error),
		data: errorDataOf(error),
	};

	const fields = key
		? { ...(args[argIndex] as Record<string, unknown>), [key]: annotatedError }
		: { error: annotatedError };

	return args.map((arg, index) => (index === argIndex ? fields : arg));
};
