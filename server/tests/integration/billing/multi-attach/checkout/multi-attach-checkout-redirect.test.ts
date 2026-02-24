import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: PM on file + redirect_mode "always" → returns checkout URL
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout redirect: PM on file + redirect always → checkout URL")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	const planA = products.pro({
		id: "plan-a",
		items: [messagesItem],
	});
	const planB = products.base({
		id: "plan-b",
		items: [usersItem, items.monthlyPrice({ price: 15 })],
		group: "group-b",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "ma-co-redirect-always",
		setup: [
			s.customer({ paymentMethod: "success" }), // Has payment method
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	// Multi-attach with redirect_mode: "always"
	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
			redirect_mode: "always",
		},
		{ timeout: 0 },
	);

	// Should return a checkout URL even though PM is on file
	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: PM on file + redirect_mode "if_required" → no checkout URL
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout redirect: PM on file + redirect if_required → no URL")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });

	const plan = products.pro({
		id: "plan",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "ma-co-redirect-if-required",
		setup: [
			s.customer({ paymentMethod: "success" }), // Has payment method
			s.products({ list: [plan] }),
		],
		actions: [],
	});

	// Multi-attach with default redirect_mode (if_required)
	// Payment method on file → should charge directly, no URL
	const result = await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [{ plan_id: plan.id }],
	});

	// Should NOT return a checkout URL since PM is on file and redirect_mode is if_required
	expect(result.payment_url).toBeNull();

	// Verify product was attached directly
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [plan.id],
	});

	// Invoice: $20 charged directly
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});
