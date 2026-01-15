import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts";

/**
 * Subscription Update Quantity - While Canceling Tests
 *
 * Tests for updating prepaid quantity on a subscription that is in the process
 * of being canceled or is scheduled to downgrade.
 *
 * Expected behavior: Canceling state and scheduled products should be preserved
 * after quantity updates.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEST CASE 1: Update quantity while product is canceling (free default scheduled)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Prepaid product
 * - Free default product exists
 * - User cancels Prepaid → free default is scheduled
 * - User updates prepaid quantity
 *
 * Expected Result:
 * - Prepaid should remain canceling (canceling state preserved)
 * - Scheduled free product should remain scheduled
 * - Stripe subscription is correct (still set to cancel at period end)
 */
test.concurrent(`${chalk.yellowBright("quantity-while-cancelling: active canceling product")}`, async () => {
	const customerId = "qty-cancel-active";
	const billingUnits = 10;
	const pricePerUnit = 5;

	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	// Free is the default product
	const free = constructProduct({
		id: "free",
		items: [prepaidItem],
		type: "free",
		isDefault: true,
	});

	const prepaid = constructRawProduct({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, prepaid] }),
		],
		actions: [
			s.attach({
				productId: prepaid.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
			s.cancel({ productId: prepaid.id }), // Cancel prepaid → free scheduled
		],
	});

	// Verify prepaid is canceled and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: prepaid.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Now update prepaid's quantity while it's canceling (10 → 20 units)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: prepaid.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	// Verify state after update
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Prepaid should remain canceling (canceling state preserved)
	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: prepaid.id,
	});

	// Scheduled free product should remain scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Balance should be updated to 200 (20 units × 10 billing_units)
	expect(customerAfterUpdate.features?.[TestFeature.Messages]?.balance).toBe(
		200,
	);

	// Verify Stripe subscription is correct (still set to cancel at period end)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST CASE 2: Update quantity on scheduled product during downgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Premium
 * - User downgrades from Premium → Prepaid (Prepaid is scheduled)
 * - User updates the scheduled Prepaid product's quantity
 *
 * Expected Result:
 * - Scheduled Prepaid product should remain scheduled (with updated quantity)
 * - Premium product should remain canceling
 */
test.concurrent(`${chalk.yellowBright("quantity-while-cancelling: scheduled product")}`, async () => {
	const customerId = "qty-cancel-sched";
	const billingUnits = 10;
	const pricePerUnit = 5;

	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	// Premium product ($50/mo)
	const premium = constructProduct({
		id: "premium",
		items: [prepaidItem],
		type: "premium",
		isDefault: false,
	});

	// Prepaid product
	const prepaid = constructRawProduct({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, prepaid] }),
		],
		actions: [
			s.attach({
				productId: premium.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	// User downgrades from premium to prepaid (prepaid is scheduled)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: prepaid.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits }],
	});

	// Verify premium is canceled and prepaid is scheduled
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: prepaid.id,
	});

	console.log("Products after downgrade:", customerAfterDowngrade.products);

	// Now update the scheduled prepaid's quantity (5 → 15 units)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: prepaid.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
		],
	});

	// Verify state after update
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	console.log("Products after update:", customerAfterUpdate.products);

	// Scheduled prepaid product should remain scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: prepaid.id,
	});

	// Premium product should remain canceling
	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: premium.id,
	});

	// Verify Stripe subscription is correct (still set to cancel at period end)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
		shouldBeCanceled: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST CASE 3: Update quantity while canceling with usage tracked
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Prepaid with some usage tracked
 * - User cancels Prepaid → free default is scheduled
 * - User updates prepaid quantity
 *
 * Expected Result:
 * - Prepaid should remain canceling (canceling state preserved)
 * - Scheduled free product should remain scheduled
 * - Usage should be preserved
 * - Stripe subscription is correct (still set to cancel at period end)
 */
test.concurrent(`${chalk.yellowBright("quantity-while-cancelling: preserves usage")}`, async () => {
	const customerId = "qty-cancel-usage";
	const billingUnits = 10;
	const pricePerUnit = 5;

	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	// Free is the default product
	const free = constructProduct({
		id: "free",
		items: [prepaidItem],
		type: "free",
		isDefault: true,
	});

	const prepaid = constructRawProduct({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", withDefault: true }),
			s.products({ list: [free, prepaid] }),
		],
		actions: [
			s.attach({
				productId: prepaid.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	// Track some usage
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify usage tracked (balance = 100 - 30 = 70)
	const customerWithUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerWithUsage.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);
	expect(customerWithUsage.features?.[TestFeature.Messages]?.balance).toBe(70);

	// Cancel prepaid → free scheduled
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: prepaid.id,
	});

	// Verify prepaid is canceled and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: prepaid.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Now update prepaid's quantity while it's canceling (10 → 20 units)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: prepaid.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	// Verify state after update
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Prepaid should remain canceling (canceling state preserved)
	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: prepaid.id,
	});

	// Scheduled free product should remain scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Usage should be preserved
	expect(customerAfterUpdate.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);

	// Balance should be updated: 200 (new quantity) - 30 (usage) = 170
	expect(customerAfterUpdate.features?.[TestFeature.Messages]?.balance).toBe(
		170,
	);

	// Verify Stripe subscription is correct (still set to cancel at period end)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});
