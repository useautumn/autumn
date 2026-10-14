import { expect, test } from "bun:test";
import { type ApiCustomer, computeGrantedBalanceInput } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-prepaid-granted1: granted_balance correct with prepaid + usage")}`, async () => {
	const freeMessages = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [freeMessages] });

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		price: 1,
		billingUnits: 1,
	});
	const prepaidProd = products.base({
		id: "prepaid",
		items: [prepaidMessages],
		isAddOn: true,
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-prepaid-granted1",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [freeProd, prepaidProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.attach({
				productId: prepaidProd.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: 200,
					},
				],
			}),
		],
	});

	await new Promise((resolve) => setTimeout(resolve, 3000));

	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		purchased_balance: 200,
		current_balance: 300,
		usage: 0,
	});

	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	const afterTrack = await autumnV2.customers.get<ApiCustomer>(customerId);
	const bal = afterTrack.balances[TestFeature.Messages];
	expect(bal).toMatchObject({
		granted_balance: 100,
		purchased_balance: 200,
		current_balance: 270,
		usage: 30,
	});

	const prepaidAllowance = bal.purchased_balance;
	const newGPB = 320;

	const grantedBalanceInput = computeGrantedBalanceInput({
		newGPB,
		prepaidAllowance,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: bal.current_balance,
		included_grant: grantedBalanceInput,
	});

	const afterUpdate = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUpdate.balances[TestFeature.Messages].granted_balance).toBe(120);

	const afterUpdateDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterUpdateDb.balances[TestFeature.Messages].granted_balance).toBe(
		120,
	);
});
