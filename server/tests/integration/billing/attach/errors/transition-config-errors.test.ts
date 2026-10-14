import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("transition-config-errors 1: reset_after_trial_end on allocated feature (free)")}`, async () => {
	const customerId = "trans-config-err-allocated-free";

	const pro = products.pro({
		id: "pro-allocated-workflows",
		items: [items.freeAllocatedWorkflows({ includedUsage: 5 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [
					{
						feature_id: TestFeature.Workflows,
						quantity: 5,
					},
				],
				transition_rules: {
					reset_after_trial_end: [TestFeature.Workflows],
				},
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("transition-config-errors 2: reset_after_trial_end on allocated feature (paid)")}`, async () => {
	const customerId = "trans-config-err-allocated-paid";

	const pro = products.pro({
		id: "pro-allocated-users",
		items: [items.allocatedUsers({ includedUsage: 0 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [
					{
						feature_id: TestFeature.Users,
						quantity: 5,
					},
				],
				transition_rules: {
					reset_after_trial_end: [TestFeature.Users],
				},
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("transition-config-errors 3: feature options for non-existent feature")}`, async () => {
	const customerId = "trans-config-err-nonexistent-feature";

	const pro = products.pro({
		id: "pro-users-only",
		items: [items.allocatedUsers({ includedUsage: 0 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [
					{
						feature_id: "random-nonexistent-feature",
						quantity: 5,
					},
				],
				transition_rules: {
					reset_after_trial_end: ["random-nonexistent-feature"],
				},
			});
		},
	});
});
