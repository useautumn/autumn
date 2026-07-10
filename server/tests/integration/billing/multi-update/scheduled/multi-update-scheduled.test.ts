/**
 * TDD tests for multiUpdate interactions with SCHEDULED products (downgrades).
 *
 * Contract under test:
 *   New behaviors:
 *     - Canceling a plan that has a scheduled downgrade also deletes the scheduled
 *       product (single-update side effect preserved), while another update in the
 *       same call cancels an unrelated plan — all in one evaluation
 *     - Canceling a SCHEDULED product itself deletes it and un-cancels the active
 *       plan in its group; a later update in the SAME call can then re-cancel that
 *       active plan (request-order fold: each update sees prior updates' effects)
 *
 * Pre-impl red: fails at endpoint resolution (/billing.multi_update 404).
 * Post-impl green: projected-customer fold applies each update's side effects
 * before the next update resolves.
 */

import { test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel a downgrading plan + an unrelated plan in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Group A: free default + Pro A ($20/mo) + Premium A ($50/mo). Group B: Pro B
 * - Attach Premium A + Pro B, then downgrade Premium A -> Pro A
 *   (Premium A canceling, Pro A scheduled)
 * - ONE multiUpdate: cancel Premium A EOC + cancel Pro B EOC
 *
 * Expected Result:
 * - Premium A canceling, scheduled Pro A DELETED, free A scheduled instead
 * - Pro B canceling
 * - After advance: only free A remains
 */
test.concurrent(
	`${chalk.yellowBright("multi update scheduled: cancel downgrading plan + unrelated plan")}`,
	async () => {
		const customerId = "multi-update-sched-downgrade";

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
		const premiumA = products.base({
			id: "premium-a",
			items: [
				items.monthlyPrice({ price: 50 }),
				items.monthlyWords({ includedUsage: 500 }),
			],
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
				s.products({ list: [freeA, proA, premiumA, proB] }),
			],
			actions: [
				s.attach({ productId: premiumA.id }),
				s.attach({ productId: proB.id }),
				// Downgrade group A: premium canceling, pro scheduled
				s.attach({ productId: proA.id }),
			],
		});

		// Sanity: downgrade state
		const customerBeforeUpdate =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerBeforeUpdate,
			canceling: [premiumA.id],
			scheduled: [proA.id],
			active: [proB.id],
		});

		// ── Contract: scheduled downgrade deleted + unrelated cancel, one call ───
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: premiumA.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: proB.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterUpdate =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterUpdate,
			canceling: [premiumA.id, proB.id],
			notPresent: [proA.id],
			scheduled: [freeA.id],
		});

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
			active: [freeA.id],
			notPresent: [premiumA.id, proA.id, proB.id],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel the scheduled product, then re-cancel the active plan — order pin
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium A downgrading to Pro A (Premium canceling, Pro A scheduled), no default
 * - ONE multiUpdate, in this order:
 *     1. cancel Pro A (the SCHEDULED product) -> deletes it, un-cancels Premium A
 *     2. cancel Premium A EOC -> re-cancels the now-active Premium A
 *
 * Expected Result:
 * - Pro A gone, Premium A canceling (update 2 saw update 1's un-cancel effect)
 * - Sub set to cancel at period end
 */
test.concurrent(
	`${chalk.yellowBright("multi update scheduled: cancel scheduled product then re-cancel active plan")}`,
	async () => {
		const customerId = "multi-update-sched-order";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const premiumA = products.base({
			id: "premium-a",
			items: [
				items.monthlyPrice({ price: 50 }),
				items.monthlyWords({ includedUsage: 500 }),
			],
			group: `${customerId}_a`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, premiumA] }),
			],
			actions: [
				s.attach({ productId: premiumA.id }),
				// Downgrade: premium canceling, pro scheduled
				s.attach({ productId: proA.id }),
			],
		});

		// ── Contract: request-order fold — update 2 sees update 1's side effects ─
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "cancel_immediately" },
				{ plan_id: premiumA.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterUpdate =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterUpdate,
			canceling: [premiumA.id],
			notPresent: [proA.id],
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
