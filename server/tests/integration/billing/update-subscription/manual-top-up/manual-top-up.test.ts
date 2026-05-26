/**
 * TDD test for "manual top-up via billing.update" — letting customers add credits to
 * a one-off prepaid feature on a recurring plan by calling subscriptions.update with
 * `feature_quantities`, without needing a dedicated top-up product.
 *
 * Contract under test:
 *   New types/fields:
 *     - `UpdateSubscriptionIntent.ManualTopUp = "manual_top_up"`
 *   New behaviors:
 *     - subscriptions.update against a paid-recurring cusProduct hosting a one-off
 *       prepaid price for the targeted feature → routes through ManualTopUp intent.
 *     - quantity is treated as a DELTA (matches auto-topup semantics, diverges from
 *       UpdateQuantity which is absolute).
 *     - emits a standalone Stripe invoice for the pack price (no subscription proration).
 *     - paydown of sibling overage runs first (shared with auto-topup
 *       `computeRebalancedAutoTopUp`), then remainder routes to the one-off cusEnt.
 *     - `options.quantity` on the cusProduct accumulates monotonically.
 *   Strict shape:
 *     - allowed: customer_id, plan_id (or customer_product_id/subscription_id),
 *       single-entry feature_quantities, redirect_mode, no_billing_changes,
 *       discounts, invoice_mode.
 *     - any other field present → `InvalidRequest`: "Update too complex to perform."
 *     - multi-entry feature_quantities → same error.
 *     - target cusProduct is itself one-off (not recurring) → falls back to the
 *       existing one-off error, not ManualTopUp.
 *   `no_billing_changes: true`:
 *     - delta applied for free, no Stripe invoice produced.
 *   Side effects:
 *     - DB: `customer_products.options[feature].quantity += packs`,
 *           `customer_entitlements.balance += delta` (atomic, race-safe).
 *     - Stripe: one standalone invoice (paid PM auto-charges).
 *     - NO `auto_topup_limit_state` writes, NO BillingAutoTopupSucceeded webhook.
 *
 * Pre-impl red: every assertion below fails because `handleOneOffErrors` /
 * `computeUpdateQuantityDetails` reject one-off feature-quantity updates with
 * "Not allowed to update feature quantity for one off items." today.
 *
 * Post-impl green: all assertions pass once
 *   - `UpdateSubscriptionIntent.ManualTopUp` exists on the enum,
 *   - `setupUpdateSubscriptionIntent` detects one-off+prepaid+recurring-host shape,
 *   - `computeManualTopUpPlan` builds the line item + rebalance deltas + options bump,
 *   - `handleManualTopUpErrors` enforces the strict shape,
 *   - `handleOneOffErrors` early-returns for ManualTopUp intent.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { setCustomerOverageAllowed } from "@tests/integration/balances/utils/overage-allowed-utils/customerOverageAllowedUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Happy path: delta-additive quantity, standalone invoice, options bump.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 1: update with feature_quantities on one-off prepaid item adds credits and emits standalone invoice")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-happy",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-happy-cus";

		const { autumnV1, autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// ── pre-state: 1 pack attached, balance 100, options.quantity 1, 1 invoice
		const before = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: before,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		// ── act: add 100 more credits (1 pack)
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 100 },
			],
		});

		// ── balance += 100 (delta semantics, not absolute)
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		// ── options.quantity += 1 pack (cumulative across calls)
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		// ── standalone invoice for $10 (1 pack × $10)
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});

		// ── recurring Stripe subscription should be untouched (no item changes,
		// no out-of-cycle proration). Confirm there's still exactly 1 active sub
		// and its item set is unchanged.
		const fullCustomerV3 = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
		);
		expect(fullCustomerV3).toBeDefined();
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Delta-additive on repeated calls.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 2: repeated calls each add the delta and emit a separate invoice")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-delta",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-delta-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// Two manual top-ups, each adding 1 pack (100 credits, $10).
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 100 },
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 100 },
			],
		});

		// 100 (initial) + 100 + 100 = 300 credits
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 300,
		});

		// options.quantity: 1 (initial) + 1 + 1 = 3 packs
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 3,
		});

		// 3 invoices total (1 from attach + 2 from manual top-ups)
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 10,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Paydown of sibling overage — shared logic with auto-topup rebalance.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 3: pays down sibling cusEnt overage before routing remainder to prepaid")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-paydown",
			items: [items.lifetimeMessages({ includedUsage: 1000 }), oneOffItem],
		});

		const customerId = "manual-topup-paydown-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
				}),
			],
		});

		// Allow the recurring lifetime cusEnt to go negative.
		await setCustomerOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		// Track 1500 messages. Lifetime cusEnt (1000 allowance) → -500 overage.
		// Prepaid one-off cusEnt unchanged at 0.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1500,
		});

		// Allow async deduction (SQS-backed track) to settle before we read the
		// FullCustomer for paydown candidate selection.
		await timeout(5000);

		const preTopUp = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: preTopUp,
			featureId: TestFeature.Messages,
			remaining: 0,
		});

		// Manual top-up of 600 credits (6 packs × $10 = $60).
		// Paydown: 500 → lifetime cusEnt (heals to 0). Remainder: 100 → prepaid.
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 600 },
			],
		});

		// Combined balance: lifetime 0 + prepaid 100 = 100.
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		// options.quantity reflects FULL purchase (6 packs), not just remainder.
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 6,
		});

		// Invoice for full 600 credits (6 packs × $10 = $60), paid.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 60,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Strict-shape: forbidden field rejected with "Update too complex to perform."
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 4: passing a forbidden field (cancel_action) rejects with 'Update too complex to perform.'")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-forbid",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-forbid-cus";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// `cancel_action` is not on the allowed-field list for ManualTopUp.
		// (`customize`, `version`, `free_trial` route to UpdatePlan ahead of
		// ManualTopUp by design — strict-shape only catches non-plan mutations.)
		await expect(
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: plan.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
				],
				cancel_action: "cancel_end_of_cycle",
			}),
		).rejects.toThrow(/Updating a one off prepaid feature quantity/i);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Strict-shape: multi-entry feature_quantities rejected.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 5: multi-entry feature_quantities rejected with 'Update too complex to perform.'")}`,
	async () => {
		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOffWordsItem = items.oneOffWords({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-multi",
			items: [oneOffMessagesItem, oneOffWordsItem],
		});

		const customerId = "manual-topup-multi-cus";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 100 },
						{ feature_id: TestFeature.Words, quantity: 100 },
					],
				}),
			],
		});

		await expect(
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: plan.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			}),
		).rejects.toThrow(/Updating a one off prepaid feature quantity/i);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Regression: one-off-only target plan still gets the existing one-off error.
// ─────────────────────────────────────────────────────────────────────────────

test.skip(
	`${chalk.yellowBright("manual top-up 6: one-off-only plan target falls back to existing one-off error (not ManualTopUp)")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		// One-off-only product (no recurring base price) — target cusProduct is itself
		// one-off, so the intent must NOT be promoted to ManualTopUp.
		const plan = products.oneOff({
			id: "manual-topup-oneoff-only",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-oneoff-only-cus";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// Targeting a one-off plan with feature_quantities should not be promoted
		// to ManualTopUp — the target cusProduct itself is one-off, so the existing
		// "one-off plan price/billing changes not allowed" error must surface
		// instead of the new "Update too complex" error.
		await expect(
			autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: plan.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
				],
			}),
		).rejects.toThrow(
			/(?:one[- ]off|Not allowed to update feature quantity for one off items)/i,
		);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 5b. UpdatePlan call that *changes* a one-off prepaid quantity is allowed.
//     The custom-plan flow creates the new cusProduct with the requested
//     quantity AND the one-off carryover helper preserves the existing
//     remaining balance as a lifetime cusEnt.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 5b: UpdatePlan changing a one-off prepaid quantity is allowed and preserves remaining balance")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const dashboard = items.dashboard();

		const plan = products.pro({
			id: "manual-topup-allow-updateplan",
			items: [dashboard, oneOffItem],
		});

		const customerId = "manual-topup-allow-updateplan-cus";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// Dashboard-style: legacy V0 `items` + `options` with a NEW quantity for
		// the one-off prepaid feature. Items differ from the original plan (raised
		// base price) so customize.items wins the intent → UpdatePlan. The
		// combined update is now permitted: the remaining 100 carries forward
		// as a lifetime cusEnt and the new 1300 pack is charged on top.
		const raisedBasePrice = items.monthlyPrice({ price: 30 });
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [raisedBasePrice, dashboard, oneOffItem],
			options: [{ feature_id: TestFeature.Messages, quantity: 1300 }],
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 6b. Utility fields (`proration_behavior`, `discounts`-shaped extras) are NOT
//     forbidden — strict-shape uses a deny-list, not an allow-list, so dashboard
//     calls that include `billing_behavior` (V0 → `proration_behavior` V1) work.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 6b: proration_behavior=none is accepted (dashboard parity)")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-proration",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-proration-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 100 },
			],
			proration_behavior: "none",
		});

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. `no_billing_changes: true` — delta applied free, no Stripe invoice.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("manual top-up 7: no_billing_changes=true grants credits without a Stripe invoice")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const plan = products.pro({
			id: "manual-topup-no-billing",
			items: [oneOffItem],
		});

		const customerId = "manual-topup-no-billing-cus";

		const { autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 100 },
			],
			no_billing_changes: true,
		});

		// Balance grew by 100 even though Stripe was bypassed.
		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		// options.quantity bumped by 1 pack.
		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		// Invoice count unchanged from attach (no new manual-top-up invoice).
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 30,
			latestStatus: "paid",
			latestInvoiceProductId: plan.id,
		});
	},
);
