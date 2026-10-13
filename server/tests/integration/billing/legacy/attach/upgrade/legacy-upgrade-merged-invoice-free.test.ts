/**
 * Legacy Attach V1 Upgrade - Merged Entity Tests: V1 attach (s.attach) upgrade scenarios in merged
 * entity subscriptions (migrated from server/tests/merged/upgrade/mergedUpgrade1-4.test.ts).
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade entity in merged sub + usage invoice verification
// (from mergedUpgrade1)
//
// Scenario:
// - Pro and Premium products with consumable Words
// - 2 entities, attach Pro to both → merged sub
// - Track 100k words on entity 1, 300k on entity 2
// - Advance clock 2 weeks, upgrade entity 1 from Pro to Premium
// - Advance to next invoice
// - Verify invoice total = Pro base + Premium base + entity 2 usage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 1: upgrade entity in merged sub + invoice")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-1";

		const wordsItem = items.consumableWords();
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const premium = products.premium({ id: "premium", items: [wordsItem] });

		const entity1Val = 100000;
		const entity2Val = 300000;

		const { autumnV1, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
				s.track({
					featureId: TestFeature.Words,
					value: entity1Val,
					entityIndex: 0,
					timeout: 3000,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: entity2Val,
					entityIndex: 1,
					timeout: 3000,
				}),
				// s.advanceTestClock({ weeks: 2 }),
			],
		});

		// Upgrade entity 1 from Pro to Premium
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: "ent-1",
		});

		const entity1Overage = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Words, value: entity1Val }],
			options: { onlyArrear: true },
		});

		const entity1Base =
			getBasePrice({ product: premium }) - getBasePrice({ product: pro });

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 3,
			latestTotal: entity1Base + entity1Overage,
		});

		// Advance to next invoice to check usage billing
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		// Entity 2's usage on pro should show up on the invoice
		const expectedUsageTotal = calculateExpectedInvoiceAmount({
			items: pro.items,
			usage: [{ featureId: TestFeature.Words, value: entity2Val }],
			options: { includeFixed: false, onlyArrear: true },
		});

		const basePrice =
			getBasePrice({ product: pro }) + getBasePrice({ product: premium });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoice = customer.invoices![0];
		expect(invoice.total).toBe(basePrice + expectedUsageTotal);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Upgrade cancels scheduled cancel/free
// (from mergedUpgrade4)
//
// Scenario:
// - Pro, Free, Premium products with Words feature
// - 2 entities, attach Pro to both
// - Downgrade entity 1 from Pro to Free (schedules cancellation)
// - Upgrade entity 1 to Premium → cancels scheduled free, immediate switch
//
// Expected:
// - Entity 1: Premium (active)
// - Entity 2: Pro (active)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 4: upgrade cancels scheduled cancel/free")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-4";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const free = products.base({
			id: "free",
			items: [wordsItem],
		});
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const growth = products.growth({ id: "growth", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		// Downgrade entity 1 from Pro to Free (schedules cancellation)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});

		// Verify entity 1 has Pro (active) + Free (scheduled)
		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: free.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		// Upgrade entity 1 to Premium → cancels scheduled free, immediate switch
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});

		// Entity 2 should still have Pro
		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: pro.id,
			status: "active" as unknown as CusProductStatus,
		});
	},
);
