import type { ErrorClassification } from "../../models/errorClassification.js";
import { isTransientDependencyError } from "./isTransientDependencyError.js";

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
