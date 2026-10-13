import type { ApiFeatureOverride } from "@api/features/apiFeatureOverride.js";
import { isExcludedCreditSchemaItem } from "../../../models/featureModels/featureConfig/creditConfig.js";
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
				isExcludedCreditSchemaItem(row)
					? row
					: { ...row, billing_units: row.billing_units ?? 1 },
			]),
		),
	);

/** Stable identity of a plan-item rate-card override (API shape); absent is "". */
export const featureOverrideToKey = (
	override: ApiFeatureOverride | null | undefined,
): string => {
	if (override == null) return "";
	return `credit_schema:${creditSchemaFingerprint(override.credit_schema)}|markups:${deterministicStringify(override.markups ?? {})}`;
};

/** Structural equality of two plan-item rate-card overrides (API shape). */
export const featureOverridesEqual = (
	a: ApiFeatureOverride | null | undefined,
	b: ApiFeatureOverride | null | undefined,
): boolean => featureOverrideToKey(a) === featureOverrideToKey(b);
