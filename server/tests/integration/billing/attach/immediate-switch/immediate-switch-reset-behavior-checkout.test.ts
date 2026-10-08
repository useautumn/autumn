// Immediate switch reset behavior (attach V2): consumable/prepaid usage resets, allocated
// usage carries over, and the reset_at anchor is preserved across upgrades.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Free (1 included workflow) → track 1 → Pro (3 prepaid workflows) via Stripe Checkout.
 * Expected: balance = 2, usage = 1 (the used workflow carries over).
 * Bug: usage resets and balance = 3 — surfaces in the checkout-session flow,
 * not the direct-attach flow.
 */
test(`${chalk.yellowBright("immediate-switch-reset 7: free→prepaid via checkout carries usage over")}`, async () => {
	const customerId = "reset-free-to-prepaid-carry-checkout";

	const free = products.base({
		id: "free-workflows-carry-co",
		items: [items.freeAllocatedWorkflows({ includedUsage: 1 })],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro-prepaid-workflows-carry-co",
		items: [
			items.prepaid({
				featureId: TestFeature.Workflows,
				includedUsage: 0,
				billingUnits: 1,
				price: 10,
			}),
		],
	});

	// No payment method — upgrade must go via Stripe Checkout.
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ skipWebhooks: true }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Workflows, value: 1, timeout: 2000 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Workflows,
		balance: 0,
		usage: 1,
	});

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Workflows, quantity: 3 }],
	});
	expect(upgradeResult.payment_url).toBeDefined();

	await completeStripeCheckoutFormV2({ url: upgradeResult.payment_url });
	// Wait for checkout.session.completed → customer.products.updated webhook chain.
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Workflows,
		balance: 2,
		usage: 1,
	});
});
