import type { CustomerProductIsCustomResult } from "./types/customerProductIsCustomResult.js";

/** A missing catalog or failed comparison only guesses custom, so it is never written. */
export const isDefinitiveIsCustomResult = ({
	result,
}: {
	result: CustomerProductIsCustomResult;
}) =>
	result.outcome !== "catalog_missing" &&
	result.outcome !== "comparison_failed";
