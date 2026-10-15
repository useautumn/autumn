/**
 * Contract: editing a credit system's rate reaches every cached customer that
 * inherits it, including those on a plan whose override lists another feature,
 * a customer trialing that plan, and a loose grant with no plan at all.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	FeatureType,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing.js";
import { deleteDbPlans } from "@tests/integration/catalog-v2/plans/utils/expectCatalogPlans.js";
import { deleteDbFeatures } from "@tests/integration/catalog-v2/utils/expectCatalogFeatures.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("track-feature-override-rate-change: a credit system rate edit reaches inheriting plan, trialing and loose-grant customers")}`,
	async () => {
		const inheritedFeatureId = uniqueTestId("ifo_rate_inherited");
		const overriddenFeatureId = uniqueTestId("ifo_rate_overridden");
		const creditSystemId = uniqueTestId("ifo_rate_credits");
		const planId = uniqueTestId("ifo_rate_plan");
		const trialPlanId = uniqueTestId("ifo_rate_trial");
		const featureIds = [
			inheritedFeatureId,
			overriddenFeatureId,
			creditSystemId,
		];
		const planIds = [planId, trialPlanId];

		const { autumnV1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const customerIds = {
			plan: uniqueTestId("ifo_rate_plan_cus"),
			trial: uniqueTestId("ifo_rate_trial_cus"),
			loose: uniqueTestId("ifo_rate_loose_cus"),
		};

		const meteredFeature = (featureId: string) => ({
			feature_id: featureId,
			name: featureId,
			type: FeatureType.Metered,
			consumable: true,
		});
		const creditSystem = (inheritedCost: number) => ({
			feature_id: creditSystemId,
			name: creditSystemId,
			type: FeatureType.CreditSystem,
			credit_schema: [
				{ metered_feature_id: inheritedFeatureId, credit_cost: inheritedCost },
				{ metered_feature_id: overriddenFeatureId, credit_cost: 1 },
			],
		});
		const overriddenPlan = (id: string, trial?: object) => ({
			plan_id: id,
			name: id,
			...(trial ? { free_trial: trial } : {}),
			items: [
				{
					feature_id: creditSystemId,
					included: 100,
					reset: { interval: ResetInterval.Month },
					feature_override: {
						credit_schema: [
							{ metered_feature_id: overriddenFeatureId, credit_cost: 5 },
						],
					},
				},
			],
		});

		const trackInherited = () =>
			Promise.all(
				Object.values(customerIds).map((customerId) =>
					autumnV1.track({
						customer_id: customerId,
						feature_id: inheritedFeatureId,
						value: 1,
					}),
				),
			);

		await deleteDbPlans({ ctx, planIds });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(inheritedFeatureId),
					meteredFeature(overriddenFeatureId),
					creditSystem(1),
				],
				plans: [
					overriddenPlan(planId),
					overriddenPlan(trialPlanId, {
						duration_length: 7,
						duration_type: FreeTrialDuration.Day,
						card_required: false,
					}),
				],
			});
			for (const customerId of Object.values(customerIds)) {
				await autumnV2_3.customers.create({ id: customerId, name: customerId });
			}
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerIds.plan,
				plan_id: planId,
			});
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerIds.trial,
				plan_id: trialPlanId,
			});
			await expectProductTrialing({
				customerId: customerIds.trial,
				productId: trialPlanId,
			});
			await autumnV2_2.balances.create({
				customer_id: customerIds.loose,
				feature_id: creditSystemId,
				included_grant: 100,
			});

			// Warm every customer's cache at the old rate (1 credit each), and let it
			// flush to Postgres before the cache clear rebuilds from there.
			await trackInherited();
			await timeout(3000);

			await autumnV2_3.catalogV2.update({ features: [creditSystem(3)] });
			// The subject cache clear runs on the queue, after the update returns.
			await timeout(5000);
			await trackInherited();

			// 1 at the old rate + 3 at the new one.
			const usages = Object.fromEntries(
				await Promise.all(
					Object.entries(customerIds).map(async ([kind, customerId]) => {
						const customer =
							await autumnV1.customers.get<ApiCustomerV3>(customerId);
						return [kind, customer.features[creditSystemId]?.usage];
					}),
				),
			);
			expect(usages).toEqual({ plan: 4, trial: 4, loose: 4 });
		} finally {
			for (const customerId of Object.values(customerIds)) {
				await autumnV2_3.customers.delete(customerId).catch(() => {});
			}
			await deleteDbPlans({ ctx, planIds });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
