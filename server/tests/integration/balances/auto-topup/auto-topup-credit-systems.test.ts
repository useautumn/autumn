import { expect, test } from "bun:test";
import type { ApiCustomerV5, LimitedItem } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";

const oneOffCredits = ({
	includedUsage = 0,
	billingUnits = 100,
	price = 10,
}: {
	includedUsage?: number;
	billingUnits?: number;
	price?: number;
} = {}): LimitedItem =>
	constructPrepaidItem({
		featureId: TestFeature.Credits,
		price,
		billingUnits,
		includedUsage,
		isOneOff: true,
	}) as LimitedItem;

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 40000;

// ═══════════════════════════════════════════════════════════════════
// CS1: Action track depletes credits below threshold → auto top-up fires
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("auto-topup cs1: action track depletes credits → auto top-up fires")}`, async () => {
	const creditsItem = oneOffCredits({ billingUnits: 1, price: 0.1 });
	const prod = products.base({
		id: "topup-cs1",
		items: [creditsItem],
	});

	const { customerId, autumnV2_1, ctx } = await initScenario({
		customerId: "auto-topup-cs1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Credits, quantity: 200 }],
			}),
		],
	});

	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

	// Starting balance: 200 credits
	// Configure auto top-up on credits feature: threshold=30, quantity=100
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			auto_topups: [
				{
					feature_id: TestFeature.Credits,
					enabled: true,
					threshold: 30,
					quantity: 100,
				},
			],
		},
	});

	// Action1 costs 0.2 credits per unit
	// Track 850 units of action1 → 850 × 0.2 = 170 credits deducted
	// Balance: 200 - 170 = 30 → AT threshold (>= 30) → does NOT trigger
	const action1Cost = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: 850,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 850,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midCredits = mid.balances[TestFeature.Credits]?.remaining;
	const expectedMid = new Decimal(200).sub(action1Cost).toNumber();
	expect(midCredits).toBe(expectedMid); // 30, no top-up

	// Now track 100 units of action2 → 100 × 0.6 = 60 credits deducted
	// Balance: 30 - 60 = -30... but balance can't go negative with prepaid
	// Actually, the deduction will bring it below threshold → auto top-up fires
	// Let's track a smaller amount: 10 units of action1 → 10 × 0.2 = 2 credits
	// Balance: 30 - 2 = 28 → below threshold (28 < 30) → auto top-up fires → balance = 28 + 100 = 128
	const action1CostSmall = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: 10,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 10,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedAfter = new Decimal(expectedMid)
		.sub(action1CostSmall)
		.add(100)
		.toNumber();

	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Credits,
		remaining: expectedAfter,
	});
});
// ═══════════════════════════════════════════════════════════════════
// CS2: Action track depletes credits below threshold → auto top-up fires
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("auto-topup cs2: action track depletes credits at one go → auto top-up fires")}`, async () => {
	const creditsItem = oneOffCredits({ billingUnits: 1, price: 0.1 });
	const prod = products.base({
		id: "topup-cs2",
		items: [creditsItem],
	});

	const { customerId, autumnV2_1, ctx } = await initScenario({
		customerId: "auto-topup-cs2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prod] }),
		],
		actions: [
			s.attach({
				productId: prod.id,
				options: [{ feature_id: TestFeature.Credits, quantity: 200 }],
			}),
		],
	});

	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

	// Starting balance: 200 credits
	// Configure auto top-up on credits feature: threshold=30, quantity=100
	await autumnV2_1.customers.update(customerId, {
		billing_controls: {
			auto_topups: [
				{
					feature_id: TestFeature.Credits,
					enabled: true,
					threshold: 30,
					quantity: 100,
				},
			],
		},
	});

	// Action1 costs 0.2 credits per unit
	// Track 900 units of action1 → 900 × 0.2 = 180 credits deducted
	// Balance: 200 - 180 = 20 → auto top-up fires
	const action1Cost = getCreditCost({
		featureId: TestFeature.Action1,
		creditSystem: creditFeature!,
		amount: 900,
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 900,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const midCredits = mid.balances[TestFeature.Credits]?.remaining;
	const expectedMid = new Decimal(200).sub(action1Cost).add(100).toNumber();
	expect(midCredits).toBe(expectedMid); // 20, auto top-up fires

	await expectCustomerInvoiceCorrect({
		customerId: customerId,
		count: 2,
		latestTotal: 100 * 0.1,
		latestStatus: "paid",
	});
});
