import { expect, test } from "bun:test";
import type { ApiCustomer } from "@shared/index";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

const testCase = "upgrade8";
/**
 * Allocated feature usage preserved through upgrade and immediate cancel
 */
test.concurrent(`${chalk.yellowBright("continuous_use: usage carries through upgrade + cancel_immediately to default")}`, async () => {
	const productsList = [
		products.base({
			isDefault: true,
			items: [
				constructFeatureItem({
					featureId: TestFeature.Workflows,
					includedUsage: 5,
				}),
			],
		}),
		products.pro({
			items: [
				constructFeatureItem({
					featureId: TestFeature.Workflows,
					includedUsage: 10,
				}),
			],
		}),
	];
	const { autumnV1, autumnV2 } = await initScenario({
		customerId: testCase,
		setup: [
			s.products({
				list: productsList,
			}),
			s.customer({
				testClock: false,
				paymentMethod: "success",
				withDefault: true,
			}),
		],
		actions: [],
	});

	let customer = (await autumnV2.customers.get(testCase)) as ApiCustomer;
	let balance = customer.balances[TestFeature.Workflows] ?? {
		current_balance: "Unknown",
		granted_balance: "Unknown",
	};
	expect(balance.current_balance).toBe(5);
	expect(balance.granted_balance).toBe(5);
	console.log(
		JSON.stringify(
			`${balance.current_balance} / ${balance.granted_balance} - default`,
			null,
			4,
		),
	);

	await autumnV1.track(
		{
			customer_id: testCase,
			feature_id: TestFeature.Workflows,
			value: 3,
		},
		{
			skipCache: true,
		},
	);

	customer = await autumnV2.customers.get(testCase);
	balance = customer.balances[TestFeature.Workflows] ?? {
		current_balance: "Unknown",
		granted_balance: "Unknown",
	};
	expect(balance.current_balance).toBe(2);
	expect(balance.granted_balance).toBe(5);
	console.log(
		JSON.stringify(
			`${balance.current_balance} / ${balance.granted_balance} - tracked 3`,
			null,
			4,
		),
	);

	await autumnV1.attach({
		customer_id: testCase,
		product_id: productsList[1].id,
	});

	customer = await autumnV2.customers.get(testCase);
	balance = customer.balances[TestFeature.Workflows] ?? {
		current_balance: "Unknown",
		granted_balance: "Unknown",
	};
	expect(balance.current_balance).toBe(7);
	expect(balance.granted_balance).toBe(10);
	console.log(
		JSON.stringify(
			`${balance.current_balance} / ${balance.granted_balance} - attached pro upgrade`,
			null,
			4,
		),
	);

	await autumnV1.cancel({
		customer_id: testCase,
		product_id: productsList[1].id,
		cancel_immediately: true,
	});

	customer = await autumnV2.customers.get(testCase);
	balance = customer.balances[TestFeature.Workflows] ?? {
		current_balance: "Unknown",
		granted_balance: "Unknown",
	};
	expect(balance.current_balance).toBe(2);
	expect(balance.granted_balance).toBe(5);
	console.log(
		JSON.stringify(
			`${balance.current_balance} / ${balance.granted_balance} - cancelled pro upgrade`,
			null,
			4,
		),
	);
});
