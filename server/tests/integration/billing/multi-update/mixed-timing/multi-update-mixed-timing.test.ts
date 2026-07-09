/**
 * TDD tests for multiUpdate with MIXED cancel timings on one Stripe subscription.
 *
 * Contract under test:
 *   New behaviors:
 *     - One multiUpdate may mix cancel_immediately and cancel_end_of_cycle items
 *       targeting plans on the SAME subscription. The single Stripe evaluation must
 *       produce: immediate item removal now AND end-of-cycle cancelation state,
 *       in one consistent update (neither existing action ever emits this shape)
 *     - Outcome is identical regardless of the order of updates in the array
 *   Side effects:
 *     - Prorated credit only for the immediately-canceled plan
 *     - After cycle end the EOC plan expires and the subscription is gone
 *
 * Pre-impl red: fails at endpoint resolution (/billing.multi_update 404).
 * Post-impl green: single evaluateStripeBillingPlan over the merged plan resolves
 * the mixed shape from the final-customer diff.
 */

import { test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Immediate cancel (group a) + EOC cancel (group b) in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A ($20/mo, group a) + Premium B ($50/mo, group b) on one subscription
 * - ONE multiUpdate: cancel Pro A immediately + cancel Premium B end of cycle
 *
 * Expected Result:
 * - Pro A removed now with prorated credit (~-$20)
 * - Premium B canceling; subscription survives with only Premium B's items and
 *   is set to cancel at period end
 * - After advance: nothing left, no Stripe subscription
 */
test.concurrent(
	`${chalk.yellowBright("multi update mixed timing: immediate + end of cycle on one sub")}`,
	async () => {
		const customerId = "multi-update-mixed-timing";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const premiumB = products.base({
			id: "premium-b",
			items: [items.monthlyPrice({ price: 50 }), items.dashboard()],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, premiumB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: premiumB.id }),
			],
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
				{ plan_id: premiumB.id, cancel_action: "cancel_end_of_cycle" },
			],
		};

		// ── Contract: exact credit for the immediate plan only; premium B is
		// canceling at cycle end so nothing renews ────────────────────────────────
		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -20,
			subscriptions: [
				{ planIds: [proA.id, premiumB.id], total: -20, nextCycleTotal: null },
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		// ── Contract: immediate item gone now, EOC item canceling ────────────────
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id],
			canceling: [premiumB.id],
		});

		// 2 attach invoices + 1 credit for the immediately-canceled plan
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: preview.total,
		});

		// ── Contract: surviving sub is consistent AND set to cancel at cycle end ─
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: true,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAdvance,
			notPresent: [proA.id, premiumB.id],
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
// TEST 2: Same mix, reversed array order — identical outcome
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Same setup as TEST 1, but updates array lists the EOC cancel FIRST and the
 *   immediate cancel SECOND
 *
 * Expected Result:
 * - Identical end state to TEST 1: EOC plan canceling, immediate plan gone,
 *   sub survives (canceling), credit only for the immediate plan
 */
test.concurrent(
	`${chalk.yellowBright("multi update mixed timing: order independent (EOC listed first)")}`,
	async () => {
		const customerId = "multi-update-mixed-order";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const premiumB = products.base({
			id: "premium-b",
			items: [items.monthlyPrice({ price: 50 }), items.dashboard()],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, premiumB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: premiumB.id }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: premiumB.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proA.id],
			canceling: [premiumB.id],
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: true,
		});
	},
);
