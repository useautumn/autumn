import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const REDIS_SYNC_MS = 2000;

test.concurrent(
	`${chalk.yellowBright("trial->paid: end trial early with carry_over_usages disabled resets allowance")}`,
	async () => {
		const customerId = "update-cou-reset";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-reset",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_3.billing.update(
			{
				customer_id: customerId,
				plan_id: proTrial.id,
				customize: { free_trial: null },
				carry_over_usages: { enabled: false },
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update carry_over_usages: absent param carries usage (default, back-compat)")}`,
	async () => {
		const customerId = "update-cou-default";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-default",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_3.billing.update(
			{
				customer_id: customerId,
				plan_id: proTrial.id,
				customize: { free_trial: null },
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 60,
			usage: 40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update carry_over_usages: feature_ids carries only listed feature, resets others")}`,
	async () => {
		const customerId = "update-cou-subset";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-subset",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 100 }),
			],
			trialDays: 14,
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 30,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_3.billing.update(
			{
				customer_id: customerId,
				plan_id: proTrial.id,
				customize: { free_trial: null },
				carry_over_usages: {
					enabled: true,
					feature_ids: [TestFeature.Messages],
				},
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 60,
			usage: 40,
		});
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 100,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("trial->paid: carry_over_usages survives the V0 param mapping")}`,
	async () => {
		const customerId = "update-cou-v0";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-v0",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: proTrial.id,
				free_trial: null,
				carry_over_usages: { enabled: false },
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});
	},
);
