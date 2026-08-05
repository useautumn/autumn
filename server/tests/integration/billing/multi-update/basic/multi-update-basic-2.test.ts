/**
 * TDD tests for the multiUpdate billing action — cancel multiple plans in one call.
 *
 * Slice 2 of 2: immediate cancels with preview parity.
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
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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

		await expectCustomerProducts({
			autumn: autumnV2_3,
			customerId,
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

		await expectCustomerProducts({
			autumn: autumnV2_3,
			customerId,
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
