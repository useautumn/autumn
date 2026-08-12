/**
 * catalogV2.update — create FREE plan item shapes (no price on the item):
 * boolean, metered included/reset, unlimited, pooled, rollover, entity scope.
 *
 * Contract: each item field round-trips through catalogV2.get after create.
 */

import { expect, test } from "bun:test";
import {
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectCatalogResultsCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import { createAndAssert } from "./utils/createAndAssert.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: boolean feature (bare feature_id)")}`,
	async () => {
		const planId = uniqueTestId("cv2_bool");
		await createAndAssert({
			planId,
			name: "Boolean Item",
			items: [{ feature_id: TestFeature.Dashboard }],
			expectedItems: [{ feature_id: TestFeature.Dashboard }],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: metered included + reset month / year / interval_count 3")}`,
	async () => {
		const planId = uniqueTestId("cv2_reset");
		await createAndAssert({
			planId,
			name: "Reset Intervals",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
				{
					feature_id: TestFeature.Words,
					included: 500,
					reset: { interval: ResetInterval.Year },
				},
				{
					feature_id: TestFeature.Action1,
					included: 50,
					reset: { interval: ResetInterval.Month, interval_count: 3 },
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
				{
					feature_id: TestFeature.Words,
					included: 500,
					reset: { interval: ResetInterval.Year },
				},
				{
					feature_id: TestFeature.Action1,
					included: 50,
					reset: { interval: ResetInterval.Month, interval_count: 3 },
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: non-resetting consumable (omit reset)")}`,
	async () => {
		const planId = uniqueTestId("cv2_noreset");
		// interval:null in → ResetInterval.OneOff out on the API response
		await createAndAssert({
			planId,
			name: "Non-Resetting",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 250,
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 250,
					reset: { interval: ResetInterval.OneOff },
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: unlimited true")}`,
	async () => {
		const planId = uniqueTestId("cv2_unlim");
		await createAndAssert({
			planId,
			name: "Unlimited",
			items: [
				{
					feature_id: TestFeature.Messages,
					unlimited: true,
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					unlimited: true,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: pooled boolean + pooled unlimited metered")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pooled");
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Pooled",
					items: [
						{ feature_id: TestFeature.Dashboard, pooled: true },
						{
							feature_id: TestFeature.Messages,
							unlimited: true,
							pooled: true,
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			// Unlimited metered pooled round-trips via catalogV2.get; boolean pooled
			// is persisted but omitted by toFeatureItem's boolean branch — assert DB.
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
						],
					},
				],
			});
			const full = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const dashboardEnt = full.entitlements.find(
				(ent) => ent.feature.id === TestFeature.Dashboard,
			);
			expect(dashboardEnt?.pooled).toBe(true);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: rollover max / max_percentage / expiry")}`,
	async () => {
		const planId = uniqueTestId("cv2_roll");
		await createAndAssert({
			planId,
			name: "Rollover",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 1000,
					reset: { interval: ResetInterval.Month },
					rollover: {
						max: 2000,
						expiry_duration_type: RolloverExpiryDurationType.Month,
						expiry_duration_length: 1,
					},
				},
				{
					feature_id: TestFeature.Words,
					included: 500,
					reset: { interval: ResetInterval.Month },
					rollover: {
						max_percentage: 50,
						expiry_duration_type: RolloverExpiryDurationType.Month,
						expiry_duration_length: 2,
					},
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 1000,
					rollover: {
						max: 2000,
						expiry_duration_type: RolloverExpiryDurationType.Month,
						expiry_duration_length: 1,
					},
				},
				{
					feature_id: TestFeature.Words,
					included: 500,
					rollover: {
						max_percentage: 50,
						expiry_duration_type: RolloverExpiryDurationType.Month,
						expiry_duration_length: 2,
					},
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create items: entity_feature_id (allocated / per-entity)")}`,
	async () => {
		const planId = uniqueTestId("cv2_ent");
		await createAndAssert({
			planId,
			name: "Entity Scoped",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					reset: { interval: ResetInterval.Month },
					entity_feature_id: TestFeature.Users,
				},
			],
			expectedItems: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					entity_feature_id: TestFeature.Users,
				},
			],
		});
	},
);
