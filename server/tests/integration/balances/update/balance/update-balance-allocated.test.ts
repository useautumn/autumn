import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { ProductItemFeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(`${chalk.yellowBright("update-allocated1: update balance on free allocated feature with overage")}`, async () => {
	const usersItem = constructFeatureItem({
		featureId: TestFeature.Users,
		includedUsage: 5,
		featureType: ProductItemFeatureType.ContinuousUse,
	});

	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-allocated1",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const initialCustomer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initialCustomer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 5,
		purchased_balance: 0,
		usage: 0,
	});

	const trackRes = await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 8,
	});

	expect(trackRes.balance).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});

	const afterTrack = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		current_balance: 2,
	});

	const afterUpdate1 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUpdate1.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 2,
		purchased_balance: 0,
		usage: 3,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		current_balance: -5,
	});

	const afterUpdate2 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUpdate2.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 5,
		usage: 10,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, { skip_cache: "true" });
	expect(customerFromDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 5,
		usage: 10,
	});
});
