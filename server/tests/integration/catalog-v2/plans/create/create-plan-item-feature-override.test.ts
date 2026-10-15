/**
 * catalogV2.update — plan-item feature_override: round-trips through
 * create/update/clear, persists on the entitlement row, and rejects invalid
 * shapes. credit_schema rows merge into the credit system's schema at
 * runtime (runtime behavior covered by track tests).
 */

import { expect, test } from "bun:test";
import {
	ErrCode,
	entitlements as entitlementsTable,
	FeatureType,
	ResetInterval,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { deleteDbFeatures } from "../../utils/expectCatalogFeatures.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

const seedFeatures = ({
	meteredFeatureId,
	creditSystemId,
}: {
	meteredFeatureId: string;
	creditSystemId: string;
}) => [
	{
		feature_id: meteredFeatureId,
		name: meteredFeatureId,
		type: FeatureType.Metered,
		consumable: true,
	},
	{
		feature_id: creditSystemId,
		name: creditSystemId,
		type: FeatureType.CreditSystem,
		credit_schema: [{ metered_feature_id: meteredFeatureId, credit_cost: 1 }],
	},
];

/** Feature ids are unique per test, so filtering by feature_id is enough. */
const getDbEntFeatureOverride = async ({
	ctx,
	creditSystemId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	creditSystemId: string;
}) => {
	const rows = await ctx.db
		.select({
			feature_id: entitlementsTable.feature_id,
			feature_override: entitlementsTable.feature_override,
		})
		.from(entitlementsTable)
		.where(eq(entitlementsTable.org_id, ctx.org.id));

	return rows.filter((row) => row.feature_id === creditSystemId);
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 item feature_override: creates, updates, and clears the override")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("ifo_metered");
		const creditSystemId = uniqueTestId("ifo_credits");
		const planId = uniqueTestId("ifo_plan");
		const featureIds = [meteredFeatureId, creditSystemId];

		const flatOverride = {
			credit_schema: [{ metered_feature_id: meteredFeatureId, credit_cost: 5 }],
		};
		const graduatedOverride = {
			credit_schema: [
				{
					metered_feature_id: meteredFeatureId,
					billing_units: 100,
					tier_behavior: "graduated" as const,
					tiers: [
						{ to: 10_000, credit_cost: 1 },
						{ to: "inf" as const, credit_cost: 0.5 },
					],
				},
			],
		};

		const creditItem = (featureOverride?: object) => ({
			feature_id: creditSystemId,
			included: 100,
			reset: { interval: ResetInterval.Month },
			...(featureOverride ? { feature_override: featureOverride } : {}),
		});

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			// 1. Create with a flat override.
			await autumnV2_3.catalogV2.update({
				features: seedFeatures({ meteredFeatureId, creditSystemId }),
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [creditItem(flatOverride)],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						items: [
							{
								feature_id: creditSystemId,
								included: 100,
								feature_override: flatOverride,
							},
						],
					},
				],
			});

			// Persisted in DB shape (config keys) on the entitlement row.
			const flatRows = await getDbEntFeatureOverride({
				ctx,
				creditSystemId,
			});
			expect(
				flatRows.some((row) =>
					(row.feature_override?.schema ?? []).some(
						(item) =>
							item.metered_feature_id === meteredFeatureId &&
							"credit_amount" in item &&
							item.credit_amount === 5,
					),
				),
			).toBe(true);

			// 2. Update to a graduated override.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [creditItem(graduatedOverride)],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						items: [
							{
								feature_id: creditSystemId,
								feature_override: graduatedOverride,
							},
						],
					},
				],
			});

			// 3. Omit feature_override → override cleared (items are PUT-style).
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [creditItem()],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						items: [
							{
								feature_id: creditSystemId,
								feature_override: null,
							},
						],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 item feature_override: rejects invalid overrides")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("ifo_err_metered");
		const creditSystemId = uniqueTestId("ifo_err_credits");
		const planId = uniqueTestId("ifo_err_plan");
		const featureIds = [meteredFeatureId, creditSystemId];

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: seedFeatures({ meteredFeatureId, creditSystemId }),
			});

			// On a non-credit-system item.
			await expectAutumnError({
				errCode: ErrCode.InvalidProductItem,
				errMessage: "feature_override is only supported on credit system items",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: planId,
								items: [
									{
										feature_id: meteredFeatureId,
										included: 100,
										reset: { interval: ResetInterval.Month },
										feature_override: {
											credit_schema: [
												{
													metered_feature_id: meteredFeatureId,
													credit_cost: 1,
												},
											],
										},
									},
								],
							},
						],
					}),
			});

			// Referencing a feature that doesn't exist.
			await expectAutumnError({
				errCode: ErrCode.InvalidProductItem,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: planId,
								items: [
									{
										feature_id: creditSystemId,
										included: 100,
										reset: { interval: ResetInterval.Month },
										feature_override: {
											credit_schema: [
												{
													metered_feature_id: "does_not_exist_xyz",
													credit_cost: 1,
												},
											],
										},
									},
								],
							},
						],
					}),
			});

			// Referencing another credit system (nesting).
			await expectAutumnError({
				errCode: ErrCode.InvalidFeature,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: planId,
								items: [
									{
										feature_id: creditSystemId,
										included: 100,
										reset: { interval: ResetInterval.Month },
										feature_override: {
											credit_schema: [
												{
													metered_feature_id: creditSystemId,
													credit_cost: 1,
												},
											],
										},
									},
								],
							},
						],
					}),
			});

			// Unknown override keys are rejected (strict object).
			await expectAutumnError({
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								name: planId,
								items: [
									{
										feature_id: creditSystemId,
										included: 100,
										reset: { interval: ResetInterval.Month },
										feature_override: { invoice_credit: true },
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 item feature_override: excluded rows round-trip, stale exclusions are allowed, invalid rows are rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const keptFeatureId = uniqueTestId("ifo_ex_kept");
		const excludedFeatureId = uniqueTestId("ifo_ex_excluded");
		const outsideFeatureId = uniqueTestId("ifo_ex_outside");
		const creditSystemId = uniqueTestId("ifo_ex_credits");
		const planId = uniqueTestId("ifo_ex_plan");
		const featureIds = [
			keptFeatureId,
			excludedFeatureId,
			outsideFeatureId,
			creditSystemId,
		];

		const meteredFeature = (featureId: string) => ({
			feature_id: featureId,
			name: featureId,
			type: FeatureType.Metered,
			consumable: true,
		});

		const creditItem = (credit_schema: object[]) => ({
			feature_id: creditSystemId,
			included: 100,
			reset: { interval: ResetInterval.Month },
			feature_override: { credit_schema },
		});

		const updatePlan = (credit_schema: object[]) =>
			autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planId, name: planId, items: [creditItem(credit_schema)] },
				],
			});

		const excludedOverride = {
			credit_schema: [
				{ metered_feature_id: keptFeatureId, credit_cost: 5 },
				{ metered_feature_id: excludedFeatureId, excluded: true as const },
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(keptFeatureId),
					meteredFeature(excludedFeatureId),
					meteredFeature(outsideFeatureId),
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: keptFeatureId, credit_cost: 1 },
							{ metered_feature_id: excludedFeatureId, credit_cost: 2 },
						],
					},
				],
			});

			// 1. Round-trips through the API and persists as an excluded row.
			await updatePlan(excludedOverride.credit_schema);
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						items: [
							{
								feature_id: creditSystemId,
								feature_override: excludedOverride,
							},
						],
					},
				],
			});
			const rows = await getDbEntFeatureOverride({ ctx, creditSystemId });
			expect(
				rows.some((row) =>
					(row.feature_override?.schema ?? []).some(
						(item) =>
							item.metered_feature_id === excludedFeatureId &&
							"excluded" in item &&
							item.excluded === true,
					),
				),
			).toBe(true);

			// 2. A rate on an excluded row is rejected.
			await expectAutumnError({
				errMessage: "An excluded credit_schema row only takes",
				func: () =>
					updatePlan([
						{
							metered_feature_id: excludedFeatureId,
							excluded: true,
							credit_cost: 1,
						},
					]),
			});

			// 3. Excluding a real feature the credit system doesn't have is a no-op, not an error.
			const outsideOverride = {
				credit_schema: [
					{ metered_feature_id: keptFeatureId, credit_cost: 5 },
					{ metered_feature_id: outsideFeatureId, excluded: true as const },
				],
			};
			await updatePlan(outsideOverride.credit_schema);
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						items: [
							{
								feature_id: creditSystemId,
								feature_override: outsideOverride,
							},
						],
					},
				],
			});

			// 4. Excluding a feature that doesn't exist (e.g. since deleted) is a no-op.
			await updatePlan([
				{ metered_feature_id: keptFeatureId, credit_cost: 5 },
				{ metered_feature_id: "does_not_exist_xyz", excluded: true },
			]);

			// 5. Listing a feature twice (rate + excluded) is rejected.
			await expectAutumnError({
				errCode: ErrCode.InvalidProductItem,
				errMessage: `lists ${keptFeatureId} more than once`,
				func: () =>
					updatePlan([
						{ metered_feature_id: keptFeatureId, credit_cost: 5 },
						{ metered_feature_id: keptFeatureId, excluded: true },
					]),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
