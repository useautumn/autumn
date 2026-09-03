/**
 * Tie-break for `feature_quantities` when a plan hosts BOTH a recurring prepaid
 * AND a one-off prepaid price for the SAME feature: the recurring price wins
 * (shortest interval among recurring). Stop-gap semantics while the options
 * model stays feature-keyed.
 *
 * Contract under test:
 *   New behaviors:
 *     - billing.attach with feature_quantities on a mixed plan → quantity lands
 *       on the recurring prepaid only; one-off contributes just included usage;
 *       first invoice = base + recurring prepaid charge (no one-off charge).
 *     - subscriptions.update with feature_quantities on a mixed plan → routed as
 *       UpdateQuantity on the recurring price (absolute semantics), NOT
 *       ManualTopUp (delta semantics + standalone pack invoice).
 *     - a different feature with only a one-off prepaid on the same plan is
 *       unaffected: update still routes ManualTopUp for that feature.
 *
 * Red (current):  attach double-charges (recurring + one-off both read the same
 *                 feature-keyed options entry) and double-grants balance; update
 *                 routes to ManualTopUp whenever any one-off prepaid matches.
 * Green (after):  recurring prepaid wins the tie-break at both call sites.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const RECURRING_PACK_PRICE = 8;
const ONE_OFF_PACK_PRICE = 7;
const BASE_PRICE = 20; // products.pro monthly base

// ─────────────────────────────────────────────────────────────────────────────
// 1. attach: quantity applies to the recurring prepaid only.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("prepaid tie-break 1: attach with feature_quantities on mixed plan charges recurring prepaid only")}`,
	async () => {
		const plan = products.pro({
			id: "tie-break-attach",
			items: [
				items.prepaidMessages({ price: RECURRING_PACK_PRICE }),
				items.oneOffMessages({ price: ONE_OFF_PACK_PRICE }),
			],
		});

		const customerId = "prepaid-tie-break-attach";

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// ── balance: 200 from recurring prepaid only (not 400)
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		// ── options: single feature entry at 2 packs
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		// ── invoice: base $20 + 2 packs × $8 recurring = $36 (no one-off charge)
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: BASE_PRICE + 2 * RECURRING_PACK_PRICE,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. update: routed as UpdateQuantity (absolute) on the recurring prepaid,
//    not ManualTopUp (delta on the one-off).
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("prepaid tie-break 2: update with feature_quantities on mixed plan is absolute on the recurring prepaid")}`,
	async () => {
		const plan = products.pro({
			id: "tie-break-update",
			items: [
				items.prepaidMessages({ price: RECURRING_PACK_PRICE }),
				items.oneOffMessages({ price: ONE_OFF_PACK_PRICE }),
			],
		});

		const customerId = "prepaid-tie-break-update";

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		});

		// ── absolute semantics: balance = 300 (ManualTopUp delta would give 400)
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 300,
		});

		// ── options: 3 packs absolute on the recurring price
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 3,
		});

		// ── upgrade invoice: +2 packs × $8 recurring = $16
		// (ManualTopUp would have charged 3 packs × $7 one-off = $21)
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: 2 * RECURRING_PACK_PRICE,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. isolation: a different feature with ONLY a one-off prepaid on the same
//    plan still routes ManualTopUp.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("prepaid tie-break 3: one-off-only feature on the same plan still manual-tops-up")}`,
	async () => {
		const plan = products.pro({
			id: "tie-break-isolation",
			items: [
				items.prepaidMessages({ price: RECURRING_PACK_PRICE }),
				items.oneOffWords({ price: ONE_OFF_PACK_PRICE }),
			],
		});

		const customerId = "prepaid-tie-break-isolation";

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// Manual top-up of Words (delta semantics on the one-off prepaid).
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Words, quantity: 100 }],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Words,
			remaining: 100,
		});
		// Messages untouched by the Words top-up.
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Words,
			quantity: 1,
		});

		// Standalone pack invoice: 1 pack × $7 one-off.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: ONE_OFF_PACK_PRICE,
		});
	},
);
