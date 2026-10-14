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

			const flatRows = await getDbEntFeatureOverride({
				ctx,
				creditSystemId,
			});
			expect(
				flatRows.some((row) =>
					(row.feature_override?.schema ?? []).some(
						(item) =>
							item.metered_feature_id === meteredFeatureId &&
							item.credit_amount === 5,
					),
				),
			).toBe(true);

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
