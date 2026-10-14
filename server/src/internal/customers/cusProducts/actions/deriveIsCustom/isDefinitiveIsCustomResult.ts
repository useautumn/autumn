import type { CustomerProductIsCustomResult } from "./types/customerProductIsCustomResult.js";

export const isDefinitiveIsCustomResult = ({
	result,
}: {
	result: CustomerProductIsCustomResult;
}) =>
	result.outcome !== "catalog_missing" &&
	result.outcome !== "comparison_failed";
