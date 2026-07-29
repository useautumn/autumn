/**
 * TDD test for customer-level check/track on per-entity features.
 *
 * Red-failure mode (current behavior):
 *  - cusEntMatchesEntity's no-entity branch (and fullCustomerToCustomerEntitlements'
 *    isEntityCusEnt filter) exclude cusEnts carrying per-entity balances, so a
 *    customer-level check reports allowed=false / balance=null and a
 *    customer-level track deducts nothing.
 *
 * Green-success criteria (after fix):
 *  - Customer-level check sees the pooled per-entity balance (allowed=true,
 *    remaining = sum across entities), and customer-level track deducts from it.
 *  - Entity-scoped cusProducts (e.g. provisioned licenses) stay excluded from
 *    customer-level checks — covered by license tests, unaffected here.
 */

import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("check customer-level per-entity: pooled balance visible and deductible without entity_id")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "customer-check-per-entity",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "customer-check-per-entity-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: perEntityProduct.id })],
		});

		const check = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.allowed).toBe(true);
		expect(check.balance?.remaining).toBe(200);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		await timeout(2000);

		const afterTrack = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(afterTrack.allowed).toBe(true);
		expect(afterTrack.balance?.remaining).toBe(170);

		const uncached = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(uncached.allowed).toBe(true);
		expect(uncached.balance?.remaining).toBe(170);
	},
);
