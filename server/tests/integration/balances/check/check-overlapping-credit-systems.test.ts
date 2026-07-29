/**
 * TDD test for /check with two credit systems sharing the same metered feature
 * (credits and credits3 both cover action1), where the customer only carries
 * the later-created one (credits3) and has exhausted it.
 *
 * Red-failure mode (pre-fix):
 *  - getFeatureToUseForCheck fell back to creditSystems[0] (catalog order), so
 *    check resolved to the unowned credits: feature_id = credits,
 *    required_balance converted at its cost (0.2), and NO balance/usage fields.
 *
 * Green-success criteria (after fix):
 *  - Resolves to the customer's owned pool: feature_id = credits3,
 *    allowed false, balance 0, required_balance converted at credits3's cost (2).
 */

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

		// 6 units × credit_cost 2 = 12 credits → drains credits3 to 0
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
		// 1 unit converted at credits3's cost — not credits' (0.2)
		expect(checkResponse.required_balance).toBe(2);
	},
);
