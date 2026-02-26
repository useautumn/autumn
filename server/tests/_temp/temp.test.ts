import { test } from "bun:test";
import {
	type ApiPlanV1,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const customerId = "temp-test";

test.concurrent(`${chalk.yellowBright("temp: rest update then rpc inverse update returns product to baseline")}`, async () => {
	const productId = "only_price_interval";

	const {
		autumnV2_1: autumnV2,
		autumnV1,
		autumnV0,
	} = await initScenario({
		customerId,
		setup: [s.products({ list: [] })],
		actions: [],
	});

	try {
		await autumnV2.products.delete(`${productId}_v2`);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: `${productId}_v2`,
		name: "Volume V2 Test",
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
					billing_units: 1,
					tier_behavior: TierBehavior.VolumeBased,
					tiers: [
						{ to: 100, amount: 10, flat_amount: 100 },
						{ to: TierInfinite, amount: 20, flat_amount: 90 },
					],
				},
			},
		],
	});

	const v2 = await autumnV2.products.get<ApiPlanV1>(`${productId}_v2`);
	console.log(JSON.stringify(v2, null, 2));

	// try {
	// 	await autumnV2.products.delete(`${productId}_v1`);
	// } catch (_error) {}

	// await autumnV2.products.create<ApiPlan, CreatePlanParamsV2>({
	// 	plan_id: `${productId}_v1`,
	// 	name: "Volume V1 Test",
	// 	description: "Volume V1 Test",
	// 	group: "Volume V1 Test",
	// 	add_on: false,
	// 	auto_enable: true,
	// 	items: [
	// 		{
	// 			feature_id: TestFeature.Messages,
	// 			price: {
	// 				interval: BillingInterval.Month,
	// 				billing_method: BillingMethod.Prepaid,
	// 				billing_units: 1,
	// 				tier_behavior: TierBehavior.VolumeBased,
	// 				tiers: [
	// 					{ to: 100, amount: 10, flat_amount: 100 },
	// 					{ to: TierInfinite, amount: 20, flat_amount: 90 },
	// 				],
	// 			},
	// 		},
	// 	],
	// });

	// const v1 = await autumnV1.products.get<ApiPlan>(productId);
	// console.log(JSON.stringify(v1, null, 2));

	// try {
	// 	await autumnV0.products.delete(productId);
	// } catch (_error) {}

	// await autumnV0.products.create<ApiPlan, CreatePlanParamsInput>({
	// 	id: productId,
	// 	name: "Volume V0 Test",
	// 	items: [
	// 		{
	// 			feature_id: TestFeature.Messages,
	// 			price: {
	// 				interval: BillingInterval.Month,
	// 				billing_method: BillingMethod.Prepaid,
	// 				billing_units: 1,
	// 				tier_behavior: TierBehavior.VolumeBased,
	// 				tiers: [
	// 					{ to: 100, amount: 10, flat_amount: 100 },
	// 					{ to: TierInfinite, amount: 20, flat_amount: 90 },
	// 				],
	// 			},
	// 		},
	// 	],
	// });

	// const v0 = await autumnV0.products.get<ApiPlan>(productId);
	// console.log(JSON.stringify(v0, null, 2));
});
