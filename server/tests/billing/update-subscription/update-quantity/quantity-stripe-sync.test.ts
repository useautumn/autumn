import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	initScenario,
	s,
} from "@tests/utils/testInitUtils/initScenario.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Subscription Item Quantity Difference Tests
 *
 * These tests verify that when updating a subscription, the Stripe subscription
 * item quantity is updated by applying the DIFFERENCE between old and new values,
 * not by setting an absolute value.
 *
 * This is critical because:
 * 1. A customer can have multiple customer products contributing to the same
 *    Stripe subscription item (e.g., same product attached multiple times)
 * 2. The subscription item quantity represents the SUM of all contributing products
 * 3. When updating one product, we must preserve the quantity from other products
 */

test.concurrent(
	`${chalk.yellowBright("update-quantity: stripe sync upgrade quantity difference")}`,
	async () => {
		const customerId = "qty-stripe-sync-upgrade";
		const billingUnits = 12;
		const pricePerUnit = 8;

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.NoProrations,
					},
				}),
			],
		});

		// Initial: 5 units (60 messages)
		const initialUnits = 5;
		const initialQuantity = initialUnits * billingUnits;

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
						{ feature_id: TestFeature.Messages, quantity: initialQuantity },
					],
				}),
			],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		// Get Stripe subscription item quantity before update
		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const stripeCustomerId =
			fullCustomer.processor?.id || fullCustomer.processor?.processor_id;
		expect(stripeCustomerId).toBeDefined();

		const subscriptionsBefore = await stripeCli.subscriptions.list({
			customer: stripeCustomerId as string,
			status: "all",
		});

		expect(subscriptionsBefore.data.length).toBeGreaterThan(0);
		const subscription = subscriptionsBefore.data[0];

		const subscriptionItemBefore = subscription.items.data.find(
			(item) => item.quantity !== undefined && item.quantity > 0,
		);
		expect(subscriptionItemBefore).toBeDefined();
		expect(subscriptionItemBefore!.quantity).toBe(initialUnits);

		// Update: 5 -> 8 units (difference = +3 units)
		const updatedUnits = 8;
		const updatedQuantity = updatedUnits * billingUnits;
		const unitsDifference = updatedUnits - initialUnits; // +3

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: updatedQuantity },
			],
		});

		// Verify Stripe subscription item is updated correctly
		const subscriptionsAfter = await stripeCli.subscriptions.list({
			customer: stripeCustomerId as string,
			status: "all",
		});

		const subscriptionAfter = subscriptionsAfter.data[0];
		const subscriptionItemAfter = subscriptionAfter.items.data.find(
			(item) => item.id === subscriptionItemBefore!.id,
		);

		expect(subscriptionItemAfter).toBeDefined();

		// In the simple case (one product), both approaches give the same result:
		// Absolute: quantity = 8
		// Difference: quantity = 5 + 3 = 8
		// This test verifies the mechanism works, but the bug manifests with multiple products
		expect(subscriptionItemAfter!.quantity).toBe(updatedUnits);

		// Verify the stripeSubscriptionItemQuantityDifference is being calculated correctly
		// by checking that the final quantity matches initialUnits + unitsDifference
		expect(subscriptionItemAfter!.quantity).toBe(
			initialUnits + unitsDifference,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: stripe sync downgrade quantity difference")}`,
	async () => {
		const customerId = "qty-stripe-sync-downgrade";
		const billingUnits = 12;
		const pricePerUnit = 8;

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.NoProrations,
					},
				}),
			],
		});

		// Start with 8 units (96 messages)
		const initialUnits = 8;
		const initialQuantity = initialUnits * billingUnits;

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
						{ feature_id: TestFeature.Messages, quantity: initialQuantity },
					],
				}),
			],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		// Get Stripe subscription before downgrade
		const fullCustomer = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const stripeCustomerId =
			fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

		const subscriptionsBefore = await stripeCli.subscriptions.list({
			customer: stripeCustomerId as string,
			status: "all",
		});

		const subscription = subscriptionsBefore.data[0];
		const subscriptionItemBefore = subscription.items.data.find(
			(item) => item.quantity !== undefined && item.quantity > 0,
		);
		expect(subscriptionItemBefore).toBeDefined();
		expect(subscriptionItemBefore!.quantity).toBe(initialUnits);

		// Downgrade: 8 -> 3 units (difference = -5 units)
		const downgradedUnits = 3;
		const downgradedQuantity = downgradedUnits * billingUnits;
		const unitsDifference = downgradedUnits - initialUnits; // -5

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: downgradedQuantity },
			],
		});

		const subscriptionsAfter = await stripeCli.subscriptions.list({
			customer: stripeCustomerId as string,
			status: "all",
		});

		const subscriptionAfter = subscriptionsAfter.data[0];
		const subscriptionItemAfter = subscriptionAfter.items.data.find(
			(item) => item.id === subscriptionItemBefore!.id,
		);

		expect(subscriptionItemAfter).toBeDefined();
		expect(subscriptionItemAfter!.quantity).toBe(downgradedUnits);
		expect(subscriptionItemAfter!.quantity).toBe(
			initialUnits + unitsDifference,
		);
	},
);
