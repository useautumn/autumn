import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// =============================================================================
// carry_over_balances basic1
//
// Pro: 100 messages, 30 used (balance=70)
// Upgrade to Premium (500 messages) with carry_over_balances: { enabled: true }
// Expected: balance = 570 (70 loose entitlement + 500 from new plan), usage = 0
// =============================================================================

test.concurrent(`${chalk.yellowBright("carry_over_balances basic1: remaining balance is carried over as loose entitlement on immediate upgrade")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-balances-basic1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track 30 units of usage on Pro (balance goes from 100 → 70)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	// Wait for usage to sync to Postgres before attach
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Upgrade to Premium carrying over the remaining 70 balance
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_balances: { enabled: true },
	});

	// Wait for plan switch to settle
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	console.log("customer:", JSON.stringify(customer, null, 4));
	// Balance = 500 (Premium grant) + 70 (carried-over loose entitlement)
	// Usage resets to 0 on new plan
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 570,
		usage: 0,
	});
});
