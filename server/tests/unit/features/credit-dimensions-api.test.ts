/**
 * Contract for credit dimensions on the API surface:
 * - `credit_schema` items accept `dimensions` / `multipliers` with API naming
 *   (`credit_cost`), strict like the rest of the item;
 * - API ↔ DB converters round-trip them (credit_cost ↔ credit_amount);
 * - legacy V0 shapes cannot represent them and bail rather than emit garbage;
 * - every schema comparator notices a dimension or multiplier edit.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApiFeatureV1,
	apiCreditSchemaItemToDb,
	CreateFeatureV2ParamsSchema,
	type CreditSchemaItem,
	dbCreditSchemaItemToApi,
	diffFeatureV1,
	type Entitlement,
	entsAreSame,
	type Feature,
	FeatureType,
	FeatureUsageType,
	toApiFeature,
} from "@autumn/shared";
import { apiCreditSchemaToV0 } from "@shared/api/features/changes/V1.2_FeatureChange";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { hasCreditRateCardChanged } from "@/internal/features/featureActions/hasCreditRateCardChanged.js";

const apiRow = {
	metered_feature_id: "cpu_minutes",
	credit_cost: 1,
	dimensions: {
		small: { match: { size: "small" }, credit_cost: 1 },
		large_eu: {
			match: { size: "large", region: "eu" },
			priority: 1,
			credit_cost: 20,
		},
		xl: {
			match: { size: "xl" },
			tier_behavior: "graduated" as const,
			tiers: [
				{ to: 1_000, credit_cost: 30 },
				{ to: "inf" as const, credit_cost: 25 },
			],
		},
	},
	multipliers: {
		spot: { match: { lifecycle: "spot" }, factor: 0.3 },
		promo: { match: { cohort: "2024" }, add: -0.2 },
	},
};

const dbRow: CreditSchemaItem = {
	metered_feature_id: "cpu_minutes",
	credit_amount: 1,
	dimensions: {
		small: { match: { size: "small" }, credit_amount: 1 },
		large_eu: {
			match: { size: "large", region: "eu" },
			priority: 1,
			credit_amount: 20,
		},
		xl: {
			match: { size: "xl" },
			tier_behavior: "graduated",
			tiers: [
				{ to: 1_000, credit_amount: 30 },
				{ to: "inf", credit_amount: 25 },
			],
		},
	},
	multipliers: {
		spot: { match: { lifecycle: "spot" }, factor: 0.3 },
		promo: { match: { cohort: "2024" }, add: -0.2 },
	},
};

const createParams = (creditSchema: unknown) =>
	CreateFeatureV2ParamsSchema.safeParse({
		feature_id: "credits",
		name: "Credits",
		type: FeatureType.CreditSystem,
		credit_schema: [creditSchema],
	});

describe("credit dimensions API schema", () => {
	test("accepts dimensions and multipliers on a credit_schema item", () => {
		const result = createParams(apiRow);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.credit_schema?.[0]).toEqual(apiRow);
	});

	test("rejects unknown keys inside a dimension", () => {
		const result = createParams({
			...apiRow,
			dimensions: {
				small: { match: { size: "small" }, credit_cost: 1, colour: "red" },
			},
		});

		expect(result.success).toBe(false);
	});

	test("rejects a graduated dimension whose final tier is not inf", () => {
		const result = createParams({
			...apiRow,
			dimensions: {
				xl: {
					match: { size: "xl" },
					tier_behavior: "graduated",
					tiers: [{ to: 1_000, credit_cost: 30 }],
				},
			},
		});

		expect(result.success).toBe(false);
	});
});

describe("credit dimensions converters", () => {
	test("API to DB renames credit_cost to credit_amount inside dimensions", () => {
		expect(apiCreditSchemaItemToDb(apiRow)).toEqual(dbRow);
	});

	test("DB to API is the inverse", () => {
		expect(dbCreditSchemaItemToApi(dbRow)).toEqual(apiRow);
	});

	test("plain items still convert without dimension keys", () => {
		expect(
			apiCreditSchemaItemToDb({ metered_feature_id: "a", credit_cost: 2 }),
		).toEqual({ metered_feature_id: "a", credit_amount: 2 });
	});
});

describe("credit dimensions on legacy shapes", () => {
	const creditFeature: Feature = {
		internal_id: "fe_credits",
		org_id: "org",
		env: "sandbox",
		id: "credits",
		name: "Credits",
		type: FeatureType.CreditSystem,
		config: { usage_type: FeatureUsageType.Single, schema: [dbRow] },
		archived: false,
		event_names: [],
		created_at: 1,
	} as unknown as Feature;

	test("V0 credit_schema bails to null for a dimensioned item", () => {
		expect(apiCreditSchemaToV0({ creditSchema: [apiRow] })).toBeNull();
	});

	test("V0 feature response omits credit_schema for a dimensioned item", () => {
		expect(
			toApiFeature({ feature: creditFeature }).credit_schema,
		).toBeUndefined();
	});
});

describe("credit dimensions comparators", () => {
	const withMultiplierFactor = (factor: number): CreditSchemaItem => ({
		...dbRow,
		multipliers: {
			...dbRow.multipliers,
			spot: { match: { lifecycle: "spot" }, factor },
		},
	});

	const withReorderedRecords = (): CreditSchemaItem => ({
		...dbRow,
		dimensions: {
			xl: dbRow.dimensions?.xl!,
			large_eu: dbRow.dimensions?.large_eu!,
			small: dbRow.dimensions?.small!,
		},
	});

	const config = (item: CreditSchemaItem) => ({
		usage_type: FeatureUsageType.Single,
		provider_markups: undefined,
		schema: [item],
	});

	test("hasCreditRateCardChanged sees a multiplier edit and ignores record order", () => {
		expect(
			hasCreditRateCardChanged({
				oldConfig: config(dbRow),
				newConfig: config(withMultiplierFactor(0.5)),
			}),
		).toBe(true);
		expect(
			hasCreditRateCardChanged({
				oldConfig: config(dbRow),
				newConfig: config(withReorderedRecords()),
			}),
		).toBe(false);
	});

	test("entsAreSame sees a dimension edit inside feature_override", () => {
		const build = (item: CreditSchemaItem) =>
			entitlements.build({
				feature_override: { schema: [item] },
			} as Partial<Entitlement>);

		expect(entsAreSame(build(dbRow), build(withReorderedRecords()))).toBe(true);
		expect(entsAreSame(build(dbRow), build(withMultiplierFactor(0.5)))).toBe(
			false,
		);
	});

	test("diffFeatureV1 reports a dimension rate change", () => {
		const feature = (creditSchema: ApiFeatureV1["credit_schema"]) =>
			({
				id: "credits",
				name: "Credits",
				type: FeatureType.CreditSystem,
				consumable: true,
				archived: false,
				credit_schema: creditSchema,
			}) as ApiFeatureV1;

		const changed = {
			...apiRow,
			dimensions: {
				...apiRow.dimensions,
				small: { match: { size: "small" }, credit_cost: 2 },
			},
		};

		expect(
			diffFeatureV1({ from: feature([apiRow]), to: feature([apiRow]) })
				.previous_attributes,
		).toBeNull();
		expect(
			diffFeatureV1({ from: feature([apiRow]), to: feature([changed]) })
				.previous_attributes,
		).toEqual({ credit_schema: [apiRow] });
	});
});
