import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { setCustomerOverageAllowed } from "@tests/integration/balances/utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { makeAutoTopupConfig } from "./utils/makeAutoTopupConfig.js";

/** Wait time for SQS auto top-up processing */
const AUTO_TOPUP_WAIT_MS = 40000;

/**
 * ATU Rebalance: verifies that auto top-up quantities first pay down existing overage
 * on non-prepaid, non-entity-scoped top-level cusEnts before routing the remainder to
 * the one-off prepaid cusEnt.
 *
 * Paydown is applied as a race-safe `balanceChange` delta (atomic SQL `balance + X`)
 * so concurrent usage recorded between the ATU snapshot and its execution is preserved.
 *
 * Entity-scoped cusEnts are intentionally excluded from paydown — there is no race-safe
 * per-entity atomic increment primitive today. Entity-scoped overage is left in place
 * and the full top-up quantity flows to prepaid as remainder. Adding safe entity paydown
 * is a separate follow-up that requires JSONB-path atomic updates.
 *
 * Each test attaches TWO products:
 *   - Base: `products.base` + `items.lifetimeMessages({ includedUsage })` — the overage'd
 *     cusEnt (`usage_allowed` after enabling overage) that will absorb paydown.
 *   - Top-up: `products.oneOffAddOn` + `items.oneOffMessages` — the one-off prepaid
 *     cusEnt that ATU targets. Starts at 0/0 when attached with `quantity: 0`.
 */

test.concurrent(
	`${chalk.yellowBright("auto-topup rebalance-1: paydown + remainder to prepaid")}`,
	async () => {
		const baseProd = products.base({
			id: "topup-rb1-base",
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
		});
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProd = products.oneOffAddOn({
			id: "topup-rb1-addon",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1, ctx } = await initScenario({
			customerId: "auto-topup-rb1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [baseProd, oneOffProd] }),
			],
			actions: [
				s.attach({ productId: baseProd.id }),
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		// Allow the base cusEnt to go into overage.
		await setCustomerOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		// Drive base into -500 overage (usage = 1500 against allowance 1000).
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1500,
		});

		// Configure ATU: threshold=0 (combined balance currently -500 ≤ 0), quantity=600.
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 0,
				quantity: 600,
			}),
		});

		// Fire a zero-value track to push the auto-topup trigger path (trigger happens
		// after any deduction). Value 0 keeps balance the same but still invokes the
		// post-track trigger check.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 0,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		// Post-ATU expected: base 0/1000, prepaid 100/100, combined remaining 100.
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		// Invoice: 600 credits / 100 billing_units = 6 packs × $10 = $60.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});

		// options.quantity tracks FULL top-up purchase (6 packs).
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: oneOffProd.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup rebalance-4: no overage, full remainder to prepaid (backward compat)")}`,
	async () => {
		const baseProd = products.base({
			id: "topup-rb4-base",
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
		});
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProd = products.oneOffAddOn({
			id: "topup-rb4-addon",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1, ctx } = await initScenario({
			customerId: "auto-topup-rb4",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [baseProd, oneOffProd] }),
			],
			actions: [
				s.attach({ productId: baseProd.id }),
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 1 }], // 1 pack = 100 credits prepaid
				}),
			],
		});

		// Use 750 of base + 50 of prepaid = 800 total. Base=250, prepaid=50. Combined=300.
		// ATU threshold=300, quantity=600 → no overage, full remainder to prepaid.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 800,
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 300,
				quantity: 600,
			}),
		});

		// Track 0 to trigger post-track ATU check now that config is set.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 0,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		// Base unchanged at 250, prepaid grows by 600 to 650. Combined = 900.
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 900,
		});

		// Invoice: 600 credits = 6 packs × $10 = $60. Plus the attach invoice for 1 pack = $10.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});

		// options.quantity: attached with 1 pack, ATU added 6 → 7.
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: oneOffProd.id,
			featureId: TestFeature.Messages,
			quantity: 7,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup rebalance-5: overage exceeds top-up, no remainder to prepaid")}`,
	async () => {
		const baseProd = products.base({
			id: "topup-rb5-base",
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
		});
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffProd = products.oneOffAddOn({
			id: "topup-rb5-addon",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1, ctx } = await initScenario({
			customerId: "auto-topup-rb5",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [baseProd, oneOffProd] }),
			],
			actions: [
				s.attach({ productId: baseProd.id }),
				s.attach({
					productId: oneOffProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		await setCustomerOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		// Drive base to -1000 overage (usage=2000 vs allowance=1000).
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2000,
		});

		// Top-up 600 cannot cover all 1000 overage — only pays down 600 of it.
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 0,
				quantity: 600,
			}),
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 0,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		// Base balance after paydown: -400. Prepaid unchanged at 0.
		// Combined: -400, reported as remaining: 0 (API clamps negative to 0).
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 0,
		});

		// Invoice still charged full 600 (6 packs × $10 = $60).
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: oneOffProd.id,
		});

		// options.quantity still tracks FULL purchase (6 packs) even though balance landed
		// entirely in base paydown.
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: oneOffProd.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});
	},
);
