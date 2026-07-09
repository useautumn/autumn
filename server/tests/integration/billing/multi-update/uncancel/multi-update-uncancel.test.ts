/**
 * TDD tests for multiUpdate mixing uncancel with cancel in one call.
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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Uncancel A + cancel B immediately
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro A canceling (prior EOC cancel), Pro B active, one subscription
 * - ONE multiUpdate: uncancel Pro A + cancel Pro B immediately
 *
 * Expected Result:
 * - Pro A active (cancel_at cleared), Pro B removed now
 * - Subscription survives with only Pro A's items, not canceling
 */
test.concurrent(
	`${chalk.yellowBright("multi update uncancel: uncancel A + cancel B immediately")}`,
	async () => {
		const customerId = "multi-update-uncancel-imm";

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
				s.updateSubscription({
					productId: proA.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "uncancel" },
				{ plan_id: proB.id, cancel_action: "cancel_immediately" },
			],
		});

		const customerAfterUpdate =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterUpdate,
			active: [proA.id],
			notPresent: [proB.id],
		});

		// ── Contract: sub survives with A only and is NOT canceling ──────────────
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Uncancel BOTH canceling plans in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free default (group a) + Pro A (group a) + Pro B (group b)
 * - Both pros canceled EOC via single updates → both canceling, free A scheduled
 * - ONE multiUpdate: uncancel Pro A + uncancel Pro B
 *
 * Expected Result:
 * - Both pros active again, scheduled free default DELETED
 * - Subscription no longer canceling
 */
test.concurrent(
	`${chalk.yellowBright("multi update uncancel: uncancel both plans in one call")}`,
	async () => {
		const customerId = "multi-update-uncancel-both";

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

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [freeA, proA, proB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: proB.id }),
				s.updateSubscription({
					productId: proA.id,
					cancelAction: "cancel_end_of_cycle",
				}),
				s.updateSubscription({
					productId: proB.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		// Sanity: both canceling, free default scheduled
		const customerBeforeUncancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerBeforeUncancel,
			canceling: [proA.id, proB.id],
			scheduled: [freeA.id],
		});

		// ── Contract: both uncancels compose in one call ─────────────────────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: proA.id, cancel_action: "uncancel" },
				{ plan_id: proB.id, cancel_action: "uncancel" },
			],
		});

		const customerAfterUncancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterUncancel,
			active: [proA.id, proB.id],
			notPresent: [freeA.id],
		});

		// ── Contract: sub restored, no longer canceling ──────────────────────────
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	},
);
