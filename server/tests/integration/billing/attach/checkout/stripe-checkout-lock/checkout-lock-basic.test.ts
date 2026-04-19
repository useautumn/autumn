/**
 * Checkout Session Lock — Basic Tests
 *
 * Core lock behavior: caching, blocking, and param-based replacement.
 *
 * A. Same params returns cached checkout URL (idempotent)
 * B. Different params expires old session, returns new URL
 * C. Non-checkout mode with pending checkout throws 423
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: Same params returns cached checkout URL
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("checkout-lock A: same params returns cached URL")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "checkout-lock-same-params",
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const result1 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result1.payment_url).toBeDefined();
	expect(result1.payment_url).toContain("checkout.stripe.com");

	const result2 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result2.payment_url).toBeDefined();
	expect(result2.payment_url).toBe(result1.payment_url);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Different params replaces lock (expires old session)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("checkout-lock B: different params replaces lock")}`, async () => {
	const messagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "checkout-lock-diff-params",
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const result1 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

	expect(result1.payment_url).toBeDefined();

	const result2 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	expect(result2.payment_url).toBeDefined();
	expect(result2.payment_url).not.toBe(result1.payment_url);

	await completeStripeCheckoutForm({ url: result2.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST C: Checkout pending + non-checkout re-attach → 423
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("checkout-lock C: pending checkout blocks non-checkout re-attach")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "checkout-lock-non-checkout",
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "always",
	});

	expect(result.payment_url).toBeDefined();

	await expectAutumnError({
		errCode: ErrCode.LockAlreadyExists,
		func: () =>
			autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				redirect_mode: "if_required",
			}),
	});
});
