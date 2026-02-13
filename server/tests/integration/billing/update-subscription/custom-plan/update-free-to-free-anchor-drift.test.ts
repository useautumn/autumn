import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// FREE-TO-FREE: ANCHOR DRIFT BUG REGRESSION
//
// The bug: setupResetCycleAnchor uses customerProduct.created_at instead of
// customerProduct.starts_at. On the FIRST update this is harmless because both
// values are ~equal. On the SECOND update, the intermediate CusProduct's
// created_at has drifted forward (it's Date.now() at creation), causing
// next_reset_at to shift away from the original anchor.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("free-to-free: anchor drifts after multiple updates (regression)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "f2f-anchor-drift",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage
	const messagesUsage = 20;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Record the original reset time and started_at
	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const originalResetAt =
		customerInitial.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	const originalStartedAt = customerInitial.products[0].started_at;
	expect(originalStartedAt).toBeDefined();

	// ─── Step 1: Advance 3 days, do first free-to-free update ─────────
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
	});

	const update1Items = items.monthlyMessages({ includedUsage: 150 });
	const update1Params = {
		customer_id: customerId,
		product_id: free.id,
		items: [update1Items],
	};

	const preview1 = await autumnV1.subscriptions.previewUpdate(update1Params);
	expect(preview1.total).toEqual(0);

	await autumnV1.subscriptions.update(update1Params);

	const customerAfter1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After first update: anchor should be preserved (bug is latent here)
	expectCustomerFeatureCorrect({
		customer: customerAfter1,
		featureId: TestFeature.Messages,
		includedUsage: 150,
		balance: 150 - messagesUsage,
		usage: messagesUsage,
		resetsAt: originalResetAt!,
	});

	// started_at should be preserved from the original product
	expect(customerAfter1.products[0].started_at).toEqual(originalStartedAt);

	expectCustomerInvoiceCorrect({
		customer: customerAfter1,
		count: 0,
	});

	// ─── Step 2: Advance 3 more days (T+6), do second free-to-free update ─
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
	});

	const update2Items = items.monthlyMessages({ includedUsage: 200 });
	const update2Params = {
		customer_id: customerId,
		product_id: free.id,
		items: [update2Items],
	};

	const preview2 = await autumnV1.subscriptions.previewUpdate(update2Params);
	expect(preview2.total).toEqual(0);

	await autumnV1.subscriptions.update(update2Params);

	const customerAfter2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After second update: THIS IS WHERE THE BUG MANIFESTS
	// With the bug, the anchor drifts to the intermediate CusProduct's
	// created_at (T+3 days), causing next_reset_at to shift ~3 days forward.
	// The correct behavior is to preserve the original anchor from starts_at.
	expectCustomerFeatureCorrect({
		customer: customerAfter2,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200 - messagesUsage,
		usage: messagesUsage,
		resetsAt: originalResetAt!,
	});

	// started_at should still match the original
	expect(customerAfter2.products[0].started_at).toEqual(originalStartedAt);

	expectCustomerInvoiceCorrect({
		customer: customerAfter2,
		count: 0,
	});

	await expectProductActive({
		customer: customerAfter2,
		productId: free.id,
	});
});
