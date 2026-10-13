/**
 * Cancel End of Cycle Consumable Tests: canceling products with consumable/arrear items at end of
 * cycle; overage usage is billed in the final invoice when the cycle ends naturally.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Entity + Customer consumables - cancel customer end of cycle (no double billing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has customer-level Pro with consumable messages (uses Stripe meters)
 * - Customer also has entity-level Pro with consumable messages
 * - Track overage on BOTH customer and entity
 * - Cancel CUSTOMER-level product end of cycle (entity stays active)
 * - Advance to next invoice
 *
 * Expected Result:
 * - Customer overage billed once (no double billing)
 * - Entity overage billed once
 * - Customer product removed, entity product renews
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: entity + customer - cancel customer (no double billing)")}`,
	async () => {
		const customerId = "cancel-eoc-cons-ent-cus";

		// Customer-level consumable messages (will use Stripe meters)
		const customerConsumable = items.consumableMessages({ includedUsage: 100 });

		// Entity-level consumable messages
		const entityConsumable = items.consumableMessages({ includedUsage: 100 });

		// Two separate products - both $20 base
		const customerPro = products.pro({
			id: "customer-pro",
			items: [customerConsumable],
		});

		const entityPro = products.pro({
			id: "entity-pro",
			items: [entityConsumable],
		});

		const { autumnV1, autumnV2_2, ctx, testClockId, entities } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [customerPro, entityPro] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: customerPro.id }), // Customer-level
					s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }), // Entity-level
					s.warmEntityCaches(),
					s.track({ featureId: TestFeature.Messages, value: 300 }),
					s.track({
						featureId: TestFeature.Messages,
						value: 250,
						entityIndex: 0,
					}),
				],
			});

		const entityId = entities[0].id;
		await expectBalanceCorrect({
			autumn: autumnV2_2,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 0,
			usage: 550,
			skipCache: true,
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: customerPro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify initial invoices: $20 for customer-pro + $20 for entity-pro = $40
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
		});

		const customerAfterTrack =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

		expectCustomerFeatureCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Messages,
			balance: -200,
			usage: isBalanceWorkerRoute() ? 300 : 550,
			includedUsage: isBalanceWorkerRoute() ? 100 : 200,
		});

		expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

		// Verify customer product is canceling
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: customerPro.id,
		});

		// Advance to next invoice
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 55,
				}),
		});

		// Verify final state
		const customerFinal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Customer product should be removed
		await expectProductNotPresent({
			customer: customerFinal,
			productId: customerPro.id,
		});

		// Entity product should still be active (not canceled)
		const entityFinal = await autumnV1.entities.get(customerId, entityId);
		await expectProductActive({
			customer: entityFinal,
			productId: entityPro.id,
		});

		expectCustomerFeatureCorrect({
			customer: entityFinal,
			featureId: TestFeature.Messages,
			balance: 100,
			resetsAt: addMonths(Date.now(), 2).getTime(),
		});
		if (isBalanceWorkerRoute()) {
			expect(customerFinal.features[TestFeature.Messages]).toBeUndefined();
		} else {
			expectCustomerFeatureCorrect({
				customer: customerFinal,
				featureId: TestFeature.Messages,
				balance: 100,
				includedUsage: 100,
				usage: 0,
			});
			expect(
				customerFinal.features[TestFeature.Messages].next_reset_at ?? null,
			).toBeNull();
		}

		const overageTotal = 35;
		expectCustomerInvoiceCorrect({
			customer: customerFinal,
			count: 3, // 2 initial attaches + 1 overage invoice
			latestTotal: overageTotal + 20, // 20 for one renewal.
		});

		// Verify line item billing periods are correct (now -> now + 1 month)
		await expectStripeInvoiceLineItemPeriodCorrect({
			customerId,
			productId: entityPro.id,
			periodStartMs: Date.now(),
			periodEndMs: addMonths(Date.now(), 1).getTime(),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Entity + Customer consumables - cancel BOTH end of cycle (no double billing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has customer-level Pro with consumable messages (uses Stripe meters)
 * - Customer also has entity-level Pro with consumable messages
 * - Track overage on BOTH customer and entity
 * - Cancel BOTH products end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Final invoice should only contain overages (no base prices)
 * - Customer overage: $20 (200 * $0.10)
 * - Entity overage: $15 (150 * $0.10)
 * - Total final invoice: $35 (combined, no double billing)
 */
test.concurrent(
	`${chalk.yellowBright("cancel end of cycle consumable: entity + customer - cancel both (no double billing)")}`,
	async () => {
		const customerId = "cancel-eoc-cons-both";

		// Customer-level consumable messages (will use Stripe meters)
		const customerConsumable = items.consumableMessages({ includedUsage: 100 });

		// Entity-level consumable messages
		const entityConsumable = items.consumableMessages({ includedUsage: 100 });

		// Two separate products - both $20 base
		const customerPro = products.pro({
			id: "customer-pro",
			items: [customerConsumable],
		});

		const entityPro = products.pro({
			id: "entity-pro",
			items: [entityConsumable],
		});

		const { autumnV1, autumnV2_2, ctx, testClockId, entities } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [customerPro, entityPro] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [
					s.attach({ productId: customerPro.id }), // Customer-level
					s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }), // Entity-level
					s.warmEntityCaches(),
					s.track({ featureId: TestFeature.Messages, value: 300 }),
					s.track({
						featureId: TestFeature.Messages,
						value: 250,
						entityIndex: 0,
					}),
				],
			});

		const entityId = entities[0].id;
		await expectBalanceCorrect({
			autumn: autumnV2_2,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 0,
			usage: 550,
			skipCache: true,
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: customerPro.id,
			cancel_action: "cancel_end_of_cycle",
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: entityPro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const customerAfterTrack =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

		expectCustomerFeatureCorrect({
			customer: customerAfterTrack,
			featureId: TestFeature.Messages,
			balance: -200,
			usage: isBalanceWorkerRoute() ? 300 : 550,
			includedUsage: isBalanceWorkerRoute() ? 100 : 200,
		});
		expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

		// Verify both products are canceling
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: customerPro.id,
		});

		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: entityPro.id,
		});

		// Advance to next invoice
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			beforeFinalize: async () =>
				expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: 3,
					latestTotal: 35,
				}),
		});

		// Verify final state - both products should be removed
		const customerFinal = await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			latestTotal: 35,
			latestStatus: "paid",
		});
		await expectProductNotPresent({
			customer: customerFinal,
			productId: customerPro.id,
		});

		const entityFinal = await autumnV1.entities.get(customerId, entityId);
		await expectProductNotPresent({
			customer: entityFinal,
			productId: entityPro.id,
		});

		// Verify line item billing periods are correct (now -> now + 1 month)
		await expectStripeInvoiceLineItemPeriodCorrect({
			customerId,
			productId: entityPro.id,
			periodStartMs: Date.now(),
			periodEndMs: addMonths(Date.now(), 1).getTime(),
		});
	},
);
