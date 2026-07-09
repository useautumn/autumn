/**
 * TDD tests for the multiUpdate billing action — cancel multiple plans in one call.
 *
 * Contract under test:
 *   New endpoints:
 *     - POST /billing.multi_update -> BillingResponse (latest API version only)
 *     - POST /billing.preview_multi_update -> update-subscription-style preview (has .total)
 *   New behaviors:
 *     - { customer_id, updates: [{ plan_id, cancel_action, proration_behavior? }] }
 *     - All updates fold into ONE autumn billing plan: one Stripe evaluation per
 *       subscription, one executeAutumnBillingPlan, one combined proration invoice
 *     - Canceling every plan on a subscription immediately -> whole-sub Stripe cancel
 *     - Canceling a subset -> surviving plans and their sub items untouched
 *     - proration_behavior: "none" -> no new invoice on immediate cancel
 *   Side effects:
 *     - cusProducts updated/expired, group defaults scheduled/activated
 *     - consumable overage still billed once at cycle end
 *
 * Pre-impl red: every test fails at endpoint resolution (/billing.multi_update 404).
 * Post-impl green: all assertions pass once the multiUpdate action + routes exist.
 */

import { test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel group A main + consumable add-on EOC in one call, group B survives
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Group A: free default + Pro A ($20/mo). Group B: Pro B ($20/mo)
 * - Add-on with consumable messages (100 included, overage billed in arrears)
 * - Attach Pro A, Pro B, add-on (all on one subscription), track 500 messages
 * - ONE multiUpdate: cancel Pro A EOC + cancel add-on EOC
 *
 * Expected Result:
 * - Pro A and add-on canceling, Pro B untouched, free A scheduled
 * - Stripe subscription verifies clean (schedule removes only the canceled items)
 * - After advance: free A + Pro B active, Pro A + add-on gone,
 *   renewal invoice = Pro B $20 + overage 400 * $0.10 = $60 (overage billed once)
 */
test.concurrent(
	`${chalk.yellowBright("multi update basic: cancel group A pro + addon EOC, group B survives")}`,
	async () => {
		const customerId = "multi-update-basic-eoc";

		const freeA = products.base({
			id: "free-a",
			items: [items.dashboard()],
			isDefault: true,
			group: `${customerId}_a`,
		});
		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.consumableMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [freeA, proA, proB, addon] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
				s.attach({ productId: addon.id }),
				// 400 overage on the add-on's consumable; track needs a settle before
				// the next billing write or the deduction can lose the DB-sync race
				s.track({ featureId: TestFeature.Messages, value: 500, timeout: 4000 }),
			],
		});

		// ── Contract: one call cancels both plans EOC ────────────────────────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addon.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [proA.id, addon.id],
			active: [proB.id],
			scheduled: [freeA.id],
		});

		// ── Contract: single Stripe evaluation leaves a consistent subscription ──
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1 },
		});

		// ── Contract: after cycle end, defaults + survivors settle correctly ─────
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAdvance,
			active: [freeA.id, proB.id],
			notPresent: [proA.id, addon.id],
		});

		// Renewal invoice: Pro B $20 + 400 overage * $0.10 = $60, billed exactly once
		// (3 attach invoices + 1 renewal). The overage lands via the async
		// invoice.created worker — poll until it settles under concurrent load.
		const overageDeadline = Date.now() + 60_000;
		for (;;) {
			try {
				await expectCustomerInvoiceCorrect({
					customerId,
					count: 4,
					latestTotal: 60,
				});
				break;
			} catch (error) {
				if (Date.now() > overageDeadline) throw error;
				await timeout(5000);
			}
		}
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel ALL plans immediately in one call — whole-sub cancel + preview parity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A (group a, $20/mo) + Pro B (group b, $20/mo) on one subscription
 * - previewMultiUpdate both cancels, then multiUpdate with the same params
 *
 * Expected Result:
 * - Preview total = combined prorated credit for both plans (negative)
 * - Execution: both plans removed, Stripe subscription canceled entirely,
 *   ONE credit invoice whose total matches the preview exactly and whose
 *   product_ids cover BOTH plans
 */
test.concurrent(
	`${chalk.yellowBright("multi update basic: cancel all plans immediately, whole sub canceled, preview parity")}`,
	async () => {
		const customerId = "multi-update-basic-imm-all";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
			],
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
				{ plan_id: proB.id, cancel_action: "cancel_immediately" },
			],
		};

		// ── Contract: preview = exact combined credit; nothing renews next cycle ─
		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -40,
			subscriptions: [
				{ planIds: [proA.id, proB.id], total: -40, nextCycleTotal: null },
			],
		});

		// ── Contract: execution matches preview, one credit invoice ──────────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id, proB.id],
		});

		// Attach invoices (2) + single combined credit invoice (1) carrying BOTH plans
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: preview.total,
			latestInvoiceProductIds: [proA.id, proB.id],
		});

		// ── Contract: whole-sub Stripe cancel when nothing survives ──────────────
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel 2 of 3 plans immediately — survivor and its sub items untouched
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A ($20/mo, group a), Pro B ($20/mo, group b), Premium C ($50/mo, group c)
 * - ONE multiUpdate: cancel Pro A + Pro B immediately
 *
 * Expected Result:
 * - Pro A + Pro B removed with a combined prorated credit, Premium C stays active
 * - Subscription survives with only Premium C's items (partial item removal, not
 *   whole-sub cancel)
 */
test.concurrent(
	`${chalk.yellowBright("multi update basic: cancel 2 of 3 plans immediately, survivor intact")}`,
	async () => {
		const customerId = "multi-update-basic-partial";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});
		const premiumC = products.base({
			id: "premium-c",
			items: [items.monthlyPrice({ price: 50 }), items.dashboard()],
			group: `${customerId}_c`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, proB, premiumC] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
				s.attach({ productId: premiumC.id }),
			],
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
				{ plan_id: proB.id, cancel_action: "cancel_immediately" },
			],
		};

		// Premium C survives, so this sub's next cycle renews at exactly $50
		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -40,
			subscriptions: [
				{ planIds: [proA.id, proB.id], total: -40, nextCycleTotal: 50 },
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id, proB.id],
			active: [premiumC.id],
		});

		// Combined credit for both canceled plans on one invoice (3 attaches + 1 credit)
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 4,
			latestTotal: preview.total,
			latestInvoiceProductIds: [proA.id, proB.id],
		});

		// ── Contract: surviving plan's subscription verifies clean ───────────────
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1 },
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: proration_behavior "none" on both cancels — no new invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A + Pro B attached (2 attach invoices)
 * - ONE multiUpdate: cancel both immediately with proration_behavior: "none"
 *
 * Expected Result:
 * - Both plans removed, subscription canceled, NO credit invoice created
 */
test.concurrent(
	`${chalk.yellowBright("multi update basic: proration none, cancel immediately creates no invoice")}`,
	async () => {
		const customerId = "multi-update-basic-proration-none";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyUsers({ includedUsage: 5 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
			],
		});

		// Sanity: both plans active, 2 attach invoices
		const customerBeforeCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({
			customer: customerBeforeCancel,
			productId: proA.id,
		});
		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: proA.id,
					cancel_action: "cancel_immediately",
					proration_behavior: "none",
				},
				{
					plan_id: proB.id,
					cancel_action: "cancel_immediately",
					proration_behavior: "none",
				},
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id, proB.id],
		});

		// ── Contract: no charge artifacts when proration is none ─────────────────
		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
