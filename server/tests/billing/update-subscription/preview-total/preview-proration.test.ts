import { expect, test } from "bun:test";
import { applyProration, type Price, priceToLineAmount } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Preview Total Tests
 *
 * These tests verify that preview calculations are correct by comparing
 * against manually calculated expected values using shared math utilities.
 */

// 1. Mid-cycle upgrade: free to paid with proration
test.concurrent(`${chalk.yellowBright("preview-total: mid-cycle free to paid proration")}`, async () => {
	const customerId = "preview-midcycle-f2p";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
			s.attach({ productId: "free" }),
			s.advanceTestClock({ days: 15 }), // Mid-cycle
		],
	});

	// Get subscription to find billing period
	const customer = await autumnV1.customers.get(customerId);
	const subscription = customer.products?.[0];

	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	// Add a $20/mo price
	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	// Calculate expected amount manually
	const baseAmount = priceToLineAmount({
		price: priceItem.price as unknown as Price,
		multiplier: 1,
	});

	const expectedAmount = Math.round(
		applyProration({
			now: advancedTo!,
			billingPeriod,
			amount: baseAmount,
		}),
	);

	console.log("Base amount:", baseAmount);
	console.log("Billing period:", billingPeriod);
	console.log("Advanced to:", advancedTo);
	console.log("Expected (prorated):", expectedAmount);
	console.log("Preview total:", preview.total);

	expect(preview.total).toBe(expectedAmount);
});
