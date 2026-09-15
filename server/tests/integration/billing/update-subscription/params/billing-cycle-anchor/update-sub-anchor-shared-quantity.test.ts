import { expect, test } from "bun:test";
import {
	findCustomerProductById,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { addDays, addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService.js";

// Contract: shared anchor propagation preserves target quantity writes and sibling quantities.
// Immediate and future quantity/anchor combinations fail on the existing guard before implementation.
for (const immediate of [true, false]) {
	test.concurrent(
		`anchor shared quantities: ${immediate ? "now" : "future"}`,
		async () => {
			const customerId = `anchor-qty-shared-${immediate ? "now" : "future"}`;
			const plan = products.pro({
				id: `${customerId}-plan`,
				items: [items.prepaidMessages()],
			});
			const { autumnV2_4, ctx, entities, advancedTo } = await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 2, featureId: "users" }),
					s.products({ list: [plan] }),
				],
				actions: [
					s.billing.attach({
						productId: plan.id,
						entityIndex: 0,
						options: [{ feature_id: "messages", quantity: 300 }],
					}),
					s.billing.attach({
						productId: plan.id,
						entityIndex: 1,
						options: [{ feature_id: "messages", quantity: 300 }],
					}),
					s.advanceTestClock({ days: 14 }),
				],
			});
			const before = await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				skipReset: true,
			});
			expect(before.customer_products).toHaveLength(2);
			expect(
				new Set(
					before.customer_products.flatMap(
						(product) => product.subscription_ids ?? [],
					),
				).size,
			).toBe(1);
			const frozenTime = Math.floor(advancedTo / 1000) * 1000;
			const resetAt = immediate ? frozenTime : addDays(frozenTime, 7).getTime();
			await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: plan.id,
				entity_id: entities[0].id,
				feature_quantities: [{ feature_id: "messages", quantity: 500 }],
				billing_cycle_anchor: immediate ? "now" : resetAt,
			});
			const after = await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
				skipReset: true,
			});
			expect(after.customer_products).toHaveLength(2);
			for (const original of before.customer_products) {
				const product = findCustomerProductById({
					fullCustomer: after,
					customerProductId: original.id,
				});
				expect(product).toBeDefined();
				expect(product?.subscription_ids).toEqual(original.subscription_ids);
				expect(product?.options[0].quantity).toBe(
					original.entity_id === entities[0].id ? 5 : 3,
				);
				expect(product?.billing_cycle_anchor_resets_at).toBe(
					immediate ? null : resetAt,
				);
				expect(product?.customer_entitlements[0].next_reset_at).toBe(
					immediate ? addMonths(resetAt, 1).getTime() : resetAt,
				);
			}
			await expectStripeSubscriptionCorrect({ ctx, customerId });
		},
	);
}
