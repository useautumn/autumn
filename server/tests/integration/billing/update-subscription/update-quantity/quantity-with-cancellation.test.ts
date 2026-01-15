import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

/**
 * Subscription Update - Cancellation Integration Tests
 *
 * These tests verify that subscription updates correctly interact with
 * the cancellation flow, including uncanceling subscriptions when a
 * quantity update is performed on a canceled subscription.
 */

const billingUnits = 12;

test.concurrent(
	`${chalk.yellowBright("update-quantity: uncancel when updating canceled subscription")}`,
	async () => {
		const customerId = "qty-cancel-uncancel";

		const product = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
				s.cancel({ productId: product.id }),
			],
		});

		// Verify subscription is canceled
		const customerBeforeUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const subscriptionBefore = customerBeforeUpdate.products?.find(
			(p) => p.id === product.id,
		);

		expect(subscriptionBefore).toBeDefined();
		expect(subscriptionBefore?.canceled_at).toBeDefined();
		expect(subscriptionBefore?.status).toBe("active");

		// Update quantity - should uncancel
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		const customerAfterUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const subscriptionAfter = customerAfterUpdate.products?.find(
			(p) => p.id === product.id,
		);

		// Should be uncanceled
		expect(subscriptionAfter).toBeDefined();
		expect(subscriptionAfter?.canceled_at).toBeNull();
		expect(subscriptionAfter?.status).toBe("active");

		// Balance should be updated
		const feature = customerAfterUpdate.features?.[TestFeature.Messages];
		expect(feature?.balance).toBe(20 * billingUnits);

		// Verify internal canceled flag is false
		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = fullCustomer.customer_products.find(
			(cp) => cp.product.id === product.id,
		);

		expect(customerProduct?.canceled).toBe(false);
		expect(customerProduct?.canceled_at).toBeNull();
		expect(customerProduct?.ended_at).toBeNull();
	},
);
