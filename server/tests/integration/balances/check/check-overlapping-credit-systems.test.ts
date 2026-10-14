import { expect, test } from "bun:test";

import type { CheckResponseV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("check-overlapping-credit-systems: resolves to the customer's owned pool")}`,
	async () => {
		const creditsItem = items.free({
			featureId: TestFeature.Credits3,
			includedUsage: 12,
		});
		const freeProd = products.base({
			id: "free",
			items: [creditsItem],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "check-olap-credit-systems",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 6,
		});
		await timeout(2000);

		const checkResponse = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
		})) as unknown as CheckResponseV1;

		expect(checkResponse.feature_id).toBe(TestFeature.Credits3);
		expect(checkResponse.allowed).toBe(false);
		expect(checkResponse.balance).toBe(0);
		expect(checkResponse.required_balance).toBe(2);
	},
);
