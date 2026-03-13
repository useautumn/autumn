import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem";

/**
 * Scenario:
 *
 * - Pro plan with 100,000 users free, then $0.5 per 1 user per month usage based
 * - Track 0.0003 (decimal amount)
 * - Ensure @priceToArrearProrated is correct.
 */
test.concurrent(`${chalk.yellowBright("continuous-usage-decimal: track 0.0003 (decimal amount)")}`, async () => {
	const customerId_one = "billing-units-continuous-use-decimal-1";
	const customerId_two = "billing-units-continuous-use-decimal-2";

	const free = products.base({
		items: [items.monthlyUsers({ includedUsage: 10_000 })],
		isDefault: true,
	});

	const pro = products.pro({
		items: [
			constructArrearProratedItem({
				featureId: TestFeature.Users,
				pricePerUnit: 0.5,
				includedUsage: 100_000,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId: customerId_one,
		setup: [
			s.products({ list: [pro, free] }),
			s.customer({ withDefault: true }),
		],
		actions: [s.track({ featureId: TestFeature.Users, value: 0.0003 })],
	});

	await initScenario({
		customerId: customerId_two,
		setup: [s.customer({})],
		actions: [s.track({ featureId: TestFeature.Users, value: 0.0003 })],
	});

	await timeout(2000);

	const checkout1 = await autumnV1.checkout({
		customer_id: customerId_one,
		product_id: pro.id,
	});

	const checkout2 = await autumnV1.checkout({
		customer_id: customerId_two,
		product_id: pro.id,
	});

	expect(checkout1.url).toBeDefined();
	expect(checkout2.url).toBeDefined();
});
