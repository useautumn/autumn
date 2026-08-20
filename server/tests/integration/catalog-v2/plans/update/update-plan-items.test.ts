/**
 * catalogV2.update — item/price omit-semantics and per-facet shape changes
 * (no customers). Assert via catalogV2.get.
 */

import { test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogResultsCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

const seedBasePlan = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "Item Lane Plan",
				price: { amount: 20, interval: BillingInterval.Month },
				items: [
					{ feature_id: TestFeature.Dashboard },
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: both price/items omitted → unchanged")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_omit");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Renamed Only" }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						name: "Renamed Only",
						featureIds: [TestFeature.Dashboard, TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 100 },
						basePrice: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: items only → base price carried")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_items");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 500,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 500 },
						basePrice: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: price only → items carried")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_price");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 49, interval: BillingInterval.Month },
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [TestFeature.Dashboard, TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 100 },
						basePrice: { amount: 49, interval: BillingInterval.Month },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: price null → base removed, items carried")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_pnull");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, price: null }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [TestFeature.Dashboard, TestFeature.Messages],
						basePrice: null,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: both set → both replaced")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_both");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: { amount: 99, interval: BillingInterval.Year },
						items: [
							{
								feature_id: TestFeature.Words,
								included: 10,
								reset: { interval: ResetInterval.Year },
							},
						],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [TestFeature.Words],
						allowances: { [TestFeature.Words]: 10 },
						basePrice: { amount: 99, interval: BillingInterval.Year },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: add / remove feature item")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_addrm");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{ feature_id: TestFeature.Dashboard },
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
							{
								feature_id: TestFeature.Words,
								included: 25,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [
							TestFeature.Dashboard,
							TestFeature.Messages,
							TestFeature.Words,
						],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [TestFeature.Messages],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: change included allowance")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_incl");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{ feature_id: TestFeature.Dashboard },
							{
								feature_id: TestFeature.Messages,
								included: 250,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						allowances: { [TestFeature.Messages]: 250 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: free → paid and paid → free on same feature")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_f2p");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Free to Paid",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
								price: {
									amount: 0.5,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.UsageBased,
									billing_units: 1,
								},
							},
						],
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
								feature_id: TestFeature.Messages,
								included: 100,
								price: {
									amount: 0.5,
									billing_method: BillingMethod.UsageBased,
								},
							},
						],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
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
								feature_id: TestFeature.Messages,
								included: 100,
								price: null,
							},
						],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: change amount / tiers / tier_behavior / billing_units")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_price2");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Price Shape",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								price: {
									amount: 10,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 100,
								},
							},
						],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								price: {
									tiers: [
										{ to: 600, amount: 8 },
										{ to: TierInfinite, amount: 4 },
									],
									tier_behavior: TierBehavior.VolumeBased,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 50,
								},
							},
						],
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
								feature_id: TestFeature.Messages,
								price: {
									tiers: [
										{ to: 600, amount: 8 },
										{ to: TierInfinite, amount: 4 },
									],
									tier_behavior: TierBehavior.VolumeBased,
									billing_units: 50,
									billing_method: BillingMethod.Prepaid,
								},
							},
						],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: change reset interval month → year")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_reset");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedBasePlan({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{ feature_id: TestFeature.Dashboard },
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Year },
							},
						],
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
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Year },
							},
						],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update items: toggle unlimited / pooled / rollover / proration")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_it_tog");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Toggles",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
							{
								feature_id: TestFeature.Users,
								included: 0,
								price: {
									amount: 10,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 1,
								},
							},
						],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [
							{
								feature_id: TestFeature.Messages,
								unlimited: true,
								pooled: true,
							},
							{
								feature_id: TestFeature.Words,
								included: 200,
								reset: { interval: ResetInterval.Month },
								rollover: {
									max: 400,
									expiry_duration_type: RolloverExpiryDurationType.Month,
									expiry_duration_length: 1,
								},
							},
							{
								feature_id: TestFeature.Users,
								included: 0,
								price: {
									amount: 10,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.Prepaid,
									billing_units: 1,
								},
								proration: {
									on_increase: OnIncrease.ProrateImmediately,
									on_decrease: OnDecrease.NoProrations,
								},
							},
						],
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
								feature_id: TestFeature.Messages,
								unlimited: true,
								pooled: true,
							},
							{
								feature_id: TestFeature.Words,
								included: 200,
								rollover: {
									max: 400,
									expiry_duration_type: RolloverExpiryDurationType.Month,
									expiry_duration_length: 1,
								},
							},
							{
								feature_id: TestFeature.Users,
								price: {
									amount: 10,
									billing_method: BillingMethod.Prepaid,
								},
							},
						],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
