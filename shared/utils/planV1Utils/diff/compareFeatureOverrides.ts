import type { ApiFeatureOverride } from "@api/features/apiFeatureOverride.js";
import { deterministicStringify } from "../../common/deterministicStringify.js";

type ApiCreditSchemaRow = NonNullable<
	ApiFeatureOverride["credit_schema"]
>[number];

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

export const featureOverrideToKey = (
	override: ApiFeatureOverride | null | undefined,
): string => {
	if (override == null) return "";
	return `credit_schema:${creditSchemaFingerprint(override.credit_schema)}|markups:${deterministicStringify(override.markups ?? {})}`;
};

export const featureOverridesEqual = (
	a: ApiFeatureOverride | null | undefined,
	b: ApiFeatureOverride | null | undefined,
): boolean => featureOverrideToKey(a) === featureOverrideToKey(b);
