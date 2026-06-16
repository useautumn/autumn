import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingMethod,
	FeatureType,
	FeatureUsageType,
	ProductItemInterval,
	TierBehavior,
	UsageModel,
	type Feature,
	type FrontendProduct,
	type UpdatePlanOp,
} from "@autumn/shared";
import {
	buildMigrationDraft,
	buildVersionMigrationDraft,
	type MigrationDraft,
} from "@/views/products/plan/versioning/buildMigrationDraft";

const features: Feature[] = [
	{
		internal_id: "fe_credits",
		org_id: "org_1",
		created_at: 1,
		env: AppEnv.Sandbox,
		id: "credits",
		name: "Credits",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
		display: null,
		archived: false,
		event_names: [],
	},
];

const baseProduct: FrontendProduct = {
	id: "pro",
	name: "Pro",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 2,
	group: null,
	env: AppEnv.Sandbox,
	free_trial: null,
	items: [],
	created_at: 1,
	archived: false,
	planType: "free",
	basePriceType: "free",
};

const updatePlanFilters = (draft: MigrationDraft) =>
	(draft.operations.customer ?? [])
		.filter((op): op is UpdatePlanOp => op.type === "update_plan")
		.map((op) => op.plan_filter);

const firstUpdatePlan = (draft: MigrationDraft): UpdatePlanOp => {
	const op = draft.operations.customer?.[0];
	if (op?.type === "update_plan") return op;
	throw new Error("Expected first migration operation to update a plan");
};

describe("buildMigrationDraft", () => {
	test("excludes custom customers via the filter but patches both", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: { ...baseProduct, name: "Pro updated" },
			features,
			scope: "this_version",
		});

		// Filter still excludes custom customers by default...
		expect(draft.filter.customer?.plan).toMatchObject({
			plan_id: "pro",
			version: 2,
			custom: false,
		});
		// ...but the patch op never scopes by `custom`.
		expect(firstUpdatePlan(draft).plan_filter).toEqual({
			plan_id: "pro",
			version: 2,
		});
	});

	test("targets both regular and custom plans when custom plans are included", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: { ...baseProduct, name: "Pro updated" },
			features,
			scope: "this_version",
			includeCustom: true,
		});

		expect(draft.filter.customer?.plan).toEqual({
			plan_id: "pro",
			version: 2,
		});
		expect(updatePlanFilters(draft)).toEqual([
			{
				plan_id: "pro",
				version: 2,
			},
		]);
	});

	test("patch op is never scoped by custom regardless of includeCustom", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: baseProduct,
			features,
			scope: "this_version",
			includeCustom: true,
		});

		expect(updatePlanFilters(draft)).toEqual([
			{
				plan_id: "pro",
				version: 2,
			},
		]);
	});

	test("keeps a single unscoped operation when custom customers are excluded", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: baseProduct,
			features,
			scope: "this_version",
		});

		expect(draft.operations.customer).toHaveLength(1);
		expect(firstUpdatePlan(draft).plan_filter).toEqual({
			plan_id: "pro",
			version: 2,
		});
	});

	test("preserves tiered add-item prices", () => {
		const draft = buildMigrationDraft({
			baseProduct,
			editedProduct: {
				...baseProduct,
				items: [
					{
						feature_id: "credits",
						included_usage: 0,
						interval: ProductItemInterval.Month,
						interval_count: 1,
						usage_model: UsageModel.PayPerUse,
						tiers: [
							{ to: 100, amount: 20 },
							{ to: "inf", amount: 40 },
						],
						billing_units: 1,
						tier_behavior: TierBehavior.Graduated,
					},
				],
			},
			features,
			scope: "this_version",
		});

		const updatePlan = firstUpdatePlan(draft);
		const addItem = updatePlan?.customize?.add_items?.[0];
		const price = JSON.parse(JSON.stringify(addItem?.price));

		expect(price).toMatchObject({
			tiers: [
				{ to: 100, amount: 20 },
				{ to: "inf", amount: 40 },
			],
			tier_behavior: TierBehavior.Graduated,
			billing_method: BillingMethod.UsageBased,
		});
		expect(price).not.toHaveProperty("amount");
	});
});

describe("buildVersionMigrationDraft", () => {
	test("excludes custom plans by default", () => {
		const draft = buildVersionMigrationDraft({
			productId: "pro",
			latestVersion: 3,
			scope: "all",
			pastVersions: [1, 2],
		});

		expect(draft.filter.customer?.plan).toMatchObject({
			plan_id: "pro",
			version: { $in: [1, 2] },
			custom: false,
		});
		expect(firstUpdatePlan(draft).plan_filter).toMatchObject({
			plan_id: "pro",
			version: { $in: [1, 2] },
			custom: false,
		});
	});

	test("targets both regular and custom versions when custom plans are included", () => {
		const draft = buildVersionMigrationDraft({
			productId: "pro",
			latestVersion: 3,
			scope: 2,
			pastVersions: [1, 2],
			includeCustom: true,
		});

		expect(draft.filter.customer?.plan).toEqual({
			plan_id: "pro",
			version: 2,
		});
		expect(updatePlanFilters(draft)).toEqual([
			{ plan_id: "pro", version: 2, custom: false },
			{ plan_id: "pro", version: 2, custom: true },
		]);
	});
});
