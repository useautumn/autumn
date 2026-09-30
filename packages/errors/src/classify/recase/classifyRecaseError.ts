import { RecaseError } from "@autumn/shared";
import type { ErrorClassification } from "../../models/errorClassification.js";

export const classifyRecaseError = ({
	error,
}: {
	error: unknown;
}): ErrorClassification | undefined => {
	if (!(error instanceof RecaseError)) return;

	const isCallerFacing = error.statusCode < 500;
	return { kind: isCallerFacing ? "expected" : "bug", code: error.code };
};
