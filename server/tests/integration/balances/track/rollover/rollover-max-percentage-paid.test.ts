import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type RolloverConfig,
	RolloverExpiryDurationType,
	TierBehavior,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";

// ─────────────────────────────────────────────────────────────────
// Rollover max_percentage — PAID entitlements (prepaid + consumable)
//
// Paid entitlements are reset via Stripe invoice.created webhook.
// We use s.advanceToNextInvoice() to trigger the billing cycle.
//
// For prepaid features, the starting balance includes prepaid grant:
//   startingBalance = allowance + (prepaidQuantity * billingUnits)
// ─────────────────────────────────────────────────────────────────

const rolloverConfig: RolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

test.concurrent(`${chalk.yellowBright("paid rollover max_percentage (prepaid): caps at percentage of included + prepaid grant")}`, async () => {
	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
		rolloverConfig,
	});
	const pro = products.pro({ id: "pro-pct-prepaid", items: [prepaidItem] });

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "rollover-pct-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
			s.advanceToNextInvoice(),
		],
	});

	// Starting balance = 200 total
	// Unused = 200 - 50 = 150, cap = floor(200 * 50 / 100) = 100
	// Rollover = 150 (capped)
	// Fresh grant = 200, total = 300
	const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		rollovers: [{ balance: 100 }],
	});
});

test.concurrent(`${chalk.yellowBright("paid rollover max_percentage (consumable): caps at percentage of included")}`, async () => {
	const consumableItem = constructArrearItem({
		featureId: TestFeature.Messages,
		includedUsage: 200,
		price: 0.1,
		billingUnits: 1,
		rolloverConfig,
	});
	const pro = products.pro({
		id: "pro-pct-consumable",
		items: [consumableItem],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "rollover-pct-consumable",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Starting balance = 200 (included only, no prepaid)
	// Unused = 200 - 50 = 150, cap = floor(200 * 50 / 100) = 100
	// Rollover = 100 (capped)
	// Fresh grant = 200, total = 300
	const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		rollovers: [{ balance: 100 }],
	});
});

test.concurrent(`${chalk.yellowBright("paid rollover max_percentage (prepaid): no capping when unused below cap")}`, async () => {
	const prepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
		rolloverConfig,
	});
	const pro = products.pro({
		id: "pro-pct-prepaid-under",
		items: [prepaidItem],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "rollover-pct-prepaid-under",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
			s.advanceToNextInvoice(),
		],
	});

	// Starting balance = 300, unused = 50, cap = 150
	// 50 < 150 → no capping → rollover = 50
	// Fresh grant = 300, total = 350
	const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 250,
		usage: 0,
		rollovers: [{ balance: 50 }],
	});
});

test.concurrent(`${chalk.yellowBright("paid rollover max_percentage (volume prepaid): caps at percentage of included + volume prepaid grant")}`, async () => {
	const volumePrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
		tierBehaviour: TierBehavior.VolumeBased,
		rolloverConfig,
	});
	const pro = products.pro({
		id: "pro-pct-vol-prepaid",
		items: [volumePrepaidItem],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "rollover-pct-vol-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
			s.advanceToNextInvoice(),
		],
	});

	// Starting balance = 100 (included) + 300 (prepaid quantity * billingUnits=100 → 300) = 400
	// Unused = 400 - 100 = 300, cap = floor(400 * 50 / 100) = 200
	// Rollover = 200 (capped)
	// Fresh grant = 400, total = 400 + 200 = 600
	const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: after,
		featureId: TestFeature.Messages,
		remaining: 450,
		usage: 0,
		rollovers: [{ balance: 150 }],
	});
});
