/**
 * Prepaid credits on a customer-level add-on are part of the pot shares divide.
 * The shape mirrors a docs platform: a pooled monthly grant per site plus a prepaid credits pack.
 *
 * Red (before):  allocating the whole 15k fails, "exceeds available by 5000", and reports granted 10k.
 * Green (after): the 5k prepaid pack counts, so 15k fits and the response reports granted 15k.
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { autumnV2_3 } from "./utils/allocateTestUtils.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

test.concurrent(
	`${chalk.yellowBright("allocate-prepaid1: a prepaid credits add-on counts toward the shared pot")}`,
	async () => {
		const customerId = "allocate-prepaid-1";
		const site = products.base({
			id: `${customerId}-site`,
			items: [
				{ ...items.monthlyMessages({ includedUsage: 5000 }), pooled: true },
			],
		});
		const creditsPack = products.base({
			id: `${customerId}-pack`,
			isAddOn: true,
			items: [items.prepaidMessages({ billingUnits: 1, price: 0.01 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [site, creditsPack] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: site.id, entityIndex: 0 }),
				s.billing.attach({ productId: site.id, entityIndex: 1 }),
				s.billing.attach({
					productId: creditsPack.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 5000 }],
				}),
			],
		});
		const [a, b] = entities.map((entity) => entity.id);

		const response = await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				balance_allocations: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
						allocations: [
							{ entity_id: a, amount: 9000 },
							{ entity_id: b, amount: 6000 },
						],
					},
				],
			},
		});
		expect(response.balances[TestFeature.Messages]).toMatchObject({
			granted: 15000,
			remaining: 15000,
			allocated: 15000,
			unallocated: 0,
		});

		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: a,
			expected: { granted: 9000, remaining: 9000 },
		});
	},
);
