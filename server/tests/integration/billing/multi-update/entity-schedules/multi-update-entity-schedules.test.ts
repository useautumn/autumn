/**
 * TDD tests for multiUpdate on entity plans with a subscription SCHEDULE in play.
 *
 * Contract under test:
 *   Setup shape (initTwoEntityPremiumScenario):
 *     - Premium ($50/mo) on entity 1 and entity 2, one shared subscription
 *     - Entity 1 downgrades Premium -> Pro ($20/mo): Premium@e1 canceling,
 *       Pro@e1 scheduled
 *   New behaviors:
 *     - Cancel EOC on both entities in one call: preview total is EXACTLY 0 with
 *       no next cycle; entity 1's scheduled Pro is deleted; both Premiums
 *       canceling; after advance everything is gone
 *     - Cancel immediately on both entities in one call: preview total is
 *       EXACTLY -100 (two full $50 credits at cycle start) with no next cycle;
 *       ONE credit invoice matching the preview; sub + schedule fully removed
 *
 * Pre-impl red: n/a — pins behavior of the shipped multiUpdate action against
 * schedule-bearing entity subscriptions with EXACT preview totals.
 */

import { test } from "bun:test";
import type { ApiEntityV2, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { initTwoEntityPremiumScenario } from "@tests/integration/billing/multi-update/utils/initTwoEntityPremiumScenario";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity 1 downgrading, cancel EOC on both entities in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium@e1 (canceling, Pro@e1 scheduled via downgrade) + Premium@e2 active
 * - ONE multiUpdate: cancel Premium EOC on entity 1 + entity 2
 *
 * Expected Result:
 * - Preview: total EXACTLY 0 (nothing due today), no next cycle
 * - Entity 1's scheduled Pro deleted; both Premiums canceling; sub canceling
 * - After advance: everything gone, no invoice beyond the 2 attach invoices
 */
test.concurrent(
	`${chalk.yellowBright("multi update entity schedules: downgrade then cancel EOC both entities")}`,
	async () => {
		const customerId = "multi-update-ent-sched-eoc";

		const { autumnV2_3, ctx, entities, testClockId, premium, pro } =
			await initTwoEntityPremiumScenario({
				customerId,
				withEntity1Downgrade: true,
			});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{
					plan_id: premium.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_end_of_cycle",
				},
				{
					plan_id: premium.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_end_of_cycle",
				},
			],
		};

		// ── Contract: EOC cancels charge nothing today, nothing renews ───────────
		await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: 0,
			subscriptions: [
				{ planIds: [premium.id], total: 0, nextCycleTotal: null },
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		// ── Contract: scheduled Pro deleted, both Premiums canceling ─────────────
		const entity1 = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({ customer: entity1, productId: premium.id });
		await expectProductNotPresent({ customer: entity1, productId: pro.id });

		const entity2 = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({ customer: entity2, productId: premium.id });

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});

		// ── Contract: after cycle end everything is gone, no extra invoice ───────
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		for (const entity of [entities[0], entities[1]]) {
			const entityAfterAdvance = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductNotPresent({
				customer: entityAfterAdvance,
				productId: premium.id,
			});
		}

		await expectCustomerInvoiceCorrect({ customerId, count: 2 });

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 downgrading, cancel immediately on both entities in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium@e1 (canceling, Pro@e1 scheduled via downgrade) + Premium@e2 active
 * - ONE multiUpdate: cancel Premium immediately on entity 1 + entity 2
 *
 * Expected Result:
 * - Preview: total EXACTLY -100 (two full $50 credits at cycle start), no next cycle
 * - Everything removed now (including the scheduled Pro), sub + schedule gone
 * - ONE credit invoice matching the preview exactly (2 attaches + 1 credit)
 */
test.concurrent(
	`${chalk.yellowBright("multi update entity schedules: downgrade then cancel immediately both entities")}`,
	async () => {
		const customerId = "multi-update-ent-sched-imm";

		const { autumnV2_3, ctx, entities, premium, pro } =
			await initTwoEntityPremiumScenario({
				customerId,
				withEntity1Downgrade: true,
			});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{
					plan_id: premium.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_immediately",
				},
				{
					plan_id: premium.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_immediately",
				},
			],
		};

		// ── Contract: exact combined credit for both entities' Premiums ──────────
		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -100,
			subscriptions: [
				{ planIds: [premium.id], total: -100, nextCycleTotal: null },
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		// ── Contract: both Premiums AND the scheduled Pro removed now ────────────
		for (const entity of [entities[0], entities[1]]) {
			const entityAfterCancel = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductNotPresent({
				customer: entityAfterCancel,
				productId: premium.id,
			});
			await expectProductNotPresent({
				customer: entityAfterCancel,
				productId: pro.id,
			});
		}

		// ── Contract: ONE credit invoice matching the preview exactly ────────────
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: preview.total,
			latestInvoiceProductId: premium.id,
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
