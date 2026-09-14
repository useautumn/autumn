import type { ApiFeatureOverride } from "@api/features/apiFeatureOverride.js";
import { deterministicStringify } from "../../common/deterministicStringify.js";

type ApiCreditSchemaRow = NonNullable<
	ApiFeatureOverride["credit_schema"]
>[number];

/** Rows keyed by feature so order is not semantic; billing_units defaults to 1. */
const creditSchemaFingerprint = (
	rows: ApiCreditSchemaRow[] | undefined,
): string =>
	deterministicStringify(
		Object.fromEntries(
			(rows ?? []).map((row) => [
				row.metered_feature_id,
				{ ...row, billing_units: row.billing_units ?? 1 },
			]),
		),
	);

/** Structural equality of two plan-item rate-card overrides (API shape). */
export const featureOverridesEqual = (
	a: ApiFeatureOverride | null | undefined,
	b: ApiFeatureOverride | null | undefined,
): boolean => {
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	return (
		creditSchemaFingerprint(a.credit_schema) ===
			creditSchemaFingerprint(b.credit_schema) &&
		deterministicStringify(a.markups ?? {}) ===
			deterministicStringify(b.markups ?? {})
	);
};
