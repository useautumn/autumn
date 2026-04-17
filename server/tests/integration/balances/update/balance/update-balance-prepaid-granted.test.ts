import { expect, test } from "bun:test";
import { type ApiCustomer, computeGrantedBalanceInput } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Regression: BalanceEditSheet granted_balance computation with prepaid
//
// When a customer has a prepaid component AND usage > 0, the frontend
// "set" mode must compute granted_balance correctly by subtracting the
// actual prepaid allowance — not a value derived from form defaults.
//
// The buggy formula: prepaid = defaultGPB - defaultBalance (= usage)
// The correct value: prepaid = purchased_balance (actual prepaid qty)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-prepaid-granted1: granted_balance correct with prepaid + usage")}`, async () => {
	// Free product: 100 included messages (granted_balance = 100)
	const freeMessages = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [freeMessages] });

	// Prepaid add-on: billingUnits=1, quantity=200 → 200 purchased
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		price: 1,
		billingUnits: 1,
	});
	const prepaidProd = products.base({
		id: "prepaid",
		items: [prepaidMessages],
		isAddOn: true,
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-prepaid-granted1",
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [freeProd, prepaidProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.attach({
				productId: prepaidProd.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: 200,
					},
				],
			}),
		],
	});

	// Wait for Stripe webhooks to process
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify initial: granted=100, purchased=200, current=300, usage=0
	const initial = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(initial.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		purchased_balance: 200,
		current_balance: 300,
		usage: 0,
	});

	// Track 30 usage → current drops to 270
	await autumnV2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	const afterTrack = await autumnV2.customers.get<ApiCustomer>(customerId);
	const bal = afterTrack.balances[TestFeature.Messages];
	expect(bal).toMatchObject({
		granted_balance: 100,
		purchased_balance: 200,
		current_balance: 270,
		usage: 30,
	});

	// ── Simulate BalanceEditSheet "set" mode submission ──
	// Form defaults mirror the API state:
	//   defaultGPB       = granted + purchased = 300
	//   defaultBalance   = current_balance     = 270
	//   prepaidAllowance = purchased_balance    = 200
	//
	// User increases GPB from 300 → 320 (wants +20 on granted)
	const defaultGPB = bal.granted_balance + bal.purchased_balance; // 300
	const defaultBalance = bal.current_balance; // 270
	const prepaidAllowance = bal.purchased_balance; // 200
	const newGPB = 320;

	const grantedBalanceInput = computeGrantedBalanceInput({
		newGPB,
		prepaidAllowance,
	});

	// Call the balance update API as the frontend would
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		current_balance: bal.current_balance,
		included_grant: grantedBalanceInput,
	});

	// Expected: granted_balance = 120 (100 original + 20 increase)
	// Buggy:  grantedBalanceInput = 320 - (300 - 270) = 290 → FAILS
	// Fixed:  grantedBalanceInput = 320 - 200 = 120         → PASSES
	const afterUpdate = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterUpdate.balances[TestFeature.Messages].granted_balance).toBe(120);

	// Verify DB sync
	const afterUpdateDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(afterUpdateDb.balances[TestFeature.Messages].granted_balance).toBe(
		120,
	);
});
