/**
 * TDD tests for the multiUpdate billing action — cancel multiple plans in one call.
 *
 * Slice 1 of 2: EOC cancel with survivors + proration none.
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
import type { MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { quiesceCustomerWebhooks } from "@tests/integration/billing/utils/quiesceCustomerWebhooks";
import { waitForCustomerUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
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
			],
		});

		// Three attaches means three subscriptions' worth of Stripe webhooks still
		// in flight. Let them land BEFORE tracking — one arriving inside the
		// track→sync window drops the deduction and the cycle-end overage bills $0.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV2_3,
			customerId,
		});

		// 400 overage on the add-on's consumable
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 500,
		});

		// The deduction lives only in Redis until its async sync runs; any
		// invalidation in that window (a late attach webhook, the multiUpdate's own
		// cache refresh) can drop it, and the cycle-end overage then bills $0.
		// Gate on Postgres having it rather than sleeping a fixed 4s.
		await waitForCustomerUsageInDb({
			customerId,
			featureId: TestFeature.Messages,
			balance: -400,
		});

		// ── Contract: one call cancels both plans EOC ────────────────────────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addon.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		// Cancellation state lands via the Stripe subscription update + its webhook,
		// so poll rather than asserting the first snapshot.
		await expectCustomerProducts({
			autumn: autumnV2_3,
			customerId,
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

		await expectCustomerProducts({
			autumn: autumnV2_3,
			customerId,
			active: [freeA.id, proB.id],
			notPresent: [proA.id, addon.id],
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});

		// Renewal invoice: Pro B $20 + 400 overage * $0.10 = $60, billed exactly once
		// (3 attach invoices + 1 renewal). The overage lands via the async
		// invoice.created worker — poll until it settles under concurrent load.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 4,
			latestTotal: 60,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
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
		await expectProductActive({
			autumn: autumnV2_3,
			customerId,
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

		// Removal settles once Stripe confirms the cancel, so poll instead of
		// asserting the first snapshot.
		await expectCustomerProducts({
			autumn: autumnV2_3,
			customerId,
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
