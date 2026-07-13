/**
 * TDD tests for multiUpdate targeting plans on DIFFERENT Stripe subscriptions.
 *
 * Contract under test:
 *   New behaviors:
 *     - Updates are grouped per Stripe subscription: one evaluateStripeBillingPlan
 *       + one executeStripeBillingPlan per sub, then a SINGLE executeAutumnBillingPlan
 *     - Cancel both EOC -> each sub independently set to cancel at period end
 *     - Cancel both immediately -> both subs canceled, ONE credit invoice PER
 *       subscription, each linked to its own sub and carrying ONLY that sub's
 *       plans' credits (manual invoices are subscription-linked in Stripe);
 *       preview.total remains the combined credit across all subs
 *     - Mixed: sub 1 canceled now (with its own credit invoice), sub 2 set to
 *       cancel at period end
 *
 * Pre-impl red: fails at endpoint resolution (/billing.multi_update 404).
 * Post-impl green: migrateCustomer-style per-sub grouping in the multiUpdate action.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	MultiUpdateParamsV0Input,
} from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel plans on two separate subs EOC in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) on subscription 1
 * - Add-on ($20/mo) attached with new_billing_subscription -> subscription 2
 * - ONE multiUpdate: cancel both EOC
 *
 * Expected Result:
 * - Both plans canceling; BOTH Stripe subscriptions set to cancel at period end
 * - After advance: both gone, no subscriptions left
 */
test.concurrent(
	`${chalk.yellowBright("multi update separate subs: cancel both EOC, both subs canceling")}`,
	async () => {
		const customerId = "multi-update-sep-subs-eoc";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		// Sanity: two distinct subscriptions
		const proSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const addonSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: addon.id,
		});
		expect(proSubId).not.toBe(addonSubId);

		// ── Contract: one call cancels plans across two subs ─────────────────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addon.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [pro.id, addon.id],
		});

		// ── Contract: BOTH subs verify clean and are canceling ───────────────────
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2, shouldBeCanceling: true },
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAdvance,
			notPresent: [pro.id, addon.id],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel plans on two separate subs immediately in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro on sub 1, add-on on sub 2 (new_billing_subscription)
 * - ONE multiUpdate: cancel both immediately
 *
 * Expected Result:
 * - Both plans removed, both Stripe subscriptions canceled
 * - ONE credit invoice PER subscription, each with only its own plan's credit
 *   (2 attach invoices + 2 per-sub credit invoices = 4 total)
 * - preview.total is still the combined credit (-$40)
 */
test.concurrent(
	`${chalk.yellowBright("multi update separate subs: cancel both immediately, one credit invoice per sub")}`,
	async () => {
		const customerId = "multi-update-sep-subs-imm";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_immediately" },
				{ plan_id: addon.id, cancel_action: "cancel_immediately" },
			],
		};

		// ── Contract: preview = exact combined credit across both subs ───────────
		// One core preview per sub, each with only its own plan's credit
		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -40,
			subscriptions: [
				{ planIds: [pro.id], total: -20, nextCycleTotal: null },
				{ planIds: [addon.id], total: -20, nextCycleTotal: null },
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id, addon.id],
		});

		// ── Contract: ONE credit invoice PER subscription, each ~-$20 ────────────
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 4,
			invoiceIndex: 0,
			latestTotal: preview.total / 2,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 4,
			invoiceIndex: 1,
			latestTotal: preview.total / 2,
		});

		// Each credit invoice carries exactly ONE plan's credits (order between
		// the two subs is not deterministic). Invoice arrays are a V3 shape.
		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const creditInvoiceProductIds = (customerV3.invoices ?? [])
			.slice(0, 2)
			.map((invoice) => invoice.product_ids);
		expect(
			creditInvoiceProductIds.every((productIds) => productIds.length === 1),
		).toBe(true);
		expect(creditInvoiceProductIds.flat().sort()).toEqual(
			[pro.id, addon.id].sort(),
		);

		// ── Contract: both subs canceled ─────────────────────────────────────────
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Mixed timing across two subs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro on sub 1, add-on on sub 2 (new_billing_subscription)
 * - ONE multiUpdate: cancel Pro immediately + cancel add-on EOC
 *
 * Expected Result:
 * - Pro gone now, its subscription canceled (only add-on's sub remains live)
 * - Add-on canceling; its subscription set to cancel at period end
 */
test.concurrent(
	`${chalk.yellowBright("multi update separate subs: immediate on sub 1, EOC on sub 2")}`,
	async () => {
		const customerId = "multi-update-sep-subs-mixed";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_immediately" },
				{ plan_id: addon.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id],
			canceling: [addon.id],
		});

		// ── Contract: credit invoice only for sub 1's immediate cancel ───────────
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: -20,
			latestInvoiceProductId: pro.id,
		});

		// ── Contract: only the add-on's sub remains, and it is canceling ─────────
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});
	},
);
