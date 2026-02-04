/**
 * Attach Payment Failure Tests - No Payment Method
 *
 * Tests for attach when customer has no payment method on file.
 * Expected: required_action.code = "payment_method_required"
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// UPGRADE - No Payment Method
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("no-pm 2: upgrade")}`, async () => {
	const customerId = "attach-fail-upgrade-no-pm";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: "pro" }), s.removePaymentMethod()],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_method_required");
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await completeInvoiceCheckout({ url: result.payment_url! });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
});
