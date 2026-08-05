/**
 * TDD tests for multiUpdate mixing uncancel with cancel in one call.
 *
 * Slice 1 of 2 (see multi-update-uncancel-2.test.ts for slice 2).
 *
 * Contract under test:
 *   New behaviors:
 *     - { cancel_action: "uncancel" } items compose with cancel items in one call
 *     - uncancel A + cancel B EOC on ONE sub: A's uncancel wants cancel_at cleared,
 *       B's cancel wants an end date — the single final-customer diff must resolve
 *       to "A survives, B removed at cycle end" (schedule, NOT whole-sub cancel_at)
 *     - uncancel A + cancel B immediately: A survives, B's items removed now
 *     - uncancel BOTH canceling plans in one call: sub fully restored, scheduled
 *       default products are deleted
 *
 * Pre-impl red: fails at endpoint resolution (/billing.multi_update 404).
 * Post-impl green: merged AutumnBillingPlan carries both the uncancel update and
 * the cancel update; one evaluateStripeBillingPlan resolves the combined shape.
 */

import { test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Uncancel A + cancel B end of cycle — the cancel_at collision case
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A (group a) + Pro B (group b) on one subscription
 * - Pro A is already canceling (prior single EOC cancel)
 * - ONE multiUpdate: uncancel Pro A + cancel Pro B end of cycle
 *
 * Expected Result:
 * - Pro A active again, Pro B canceling
 * - Subscription survives past cycle end (A stays), so B's removal must be a
 *   scheduled item removal — NOT a whole-sub cancel_at
 * - After advance: Pro A still active on the sub, Pro B gone
 */
test.concurrent(
	`${chalk.yellowBright("multi update uncancel: uncancel A + cancel B EOC in one call")}`,
	async () => {
		const customerId = "multi-update-uncancel-eoc";

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

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
				// Setup: put Pro A into canceling state via a single update
				s.updateSubscription({
					productId: proA.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		// ── Contract: uncancel + cancel compose in one call ──────────────────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "uncancel" },
				{ plan_id: proB.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterUpdate =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterUpdate,
			active: [proA.id],
			canceling: [proB.id],
		});

		// ── Contract: sub is consistent and NOT whole-sub canceling (A survives) ─
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1 },
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAdvance,
			active: [proA.id],
			notPresent: [proB.id],
		});

		// Pro A's subscription still alive and consistent after B's removal
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1 },
		});
	},
);
