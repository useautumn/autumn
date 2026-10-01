import type { ErrorClassification } from "../../models/errorClassification.js";
import { isTransientDependencyError } from "./isTransientDependencyError.js";

/** A dependency that was unreachable, throttling or failing on its side: one is noise, a rate is an incident. */
export const classifyDependencyError = ({
	error,
}: {
	error: unknown;
}): ErrorClassification | undefined => {
	if (!(error instanceof Error)) return;
	if (!isTransientDependencyError({ error })) return;
	return {
		kind: "infra",
		code: "code" in error ? String(error.code) : undefined,
	};
};
