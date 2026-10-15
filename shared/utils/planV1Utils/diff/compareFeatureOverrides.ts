import type { ApiFeatureOverride } from "@api/features/apiFeatureOverride.js";
import { isExcludedCreditSchemaItem } from "../../../models/featureModels/featureConfig/creditConfig.js";
import { deterministicStringify } from "../../common/deterministicStringify.js";

type ApiCreditSchemaRow = NonNullable<
	ApiFeatureOverride["credit_schema"]
>[number];

/** A rate row's billing_units defaults to 1; an excluded row has no rate to normalise. */
const normalizedRow = (row: ApiCreditSchemaRow) => {
	if (isExcludedCreditSchemaItem(row)) return row;
	return { ...row, billing_units: row.billing_units ?? 1 };
};

/** Rows keyed by feature, so order is not semantic. */
const creditSchemaFingerprint = (
	rows: ApiCreditSchemaRow[] | undefined,
): string =>
	deterministicStringify(
		Object.fromEntries(
			(rows ?? []).map((row) => [row.metered_feature_id, normalizedRow(row)]),
		),
	);

/** Stable identity of a plan-item rate-card override (API shape); absent or empty is "". */
export const featureOverrideToKey = (
	override: ApiFeatureOverride | null | undefined,
): string => {
	if (!override?.credit_schema?.length && override?.markups == null) return "";
	// Absent markups inherit the feature's; {} sets none, so they must differ.
	const markups =
		override.markups == null ? "" : deterministicStringify(override.markups);
	return `credit_schema:${creditSchemaFingerprint(override.credit_schema)}|markups:${markups}`;
};

/** Structural equality of two plan-item rate-card overrides (API shape). */
export const featureOverridesEqual = (
	a: ApiFeatureOverride | null | undefined,
	b: ApiFeatureOverride | null | undefined,
): boolean => featureOverrideToKey(a) === featureOverrideToKey(b);
