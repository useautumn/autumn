/**
 * TDD tests for multiUpdate validation errors and atomicity.
 *
 * Slice 1 of 2 (see multi-update-errors-2.test.ts for slice 2).
 *
 * Contract under test:
 *   New behaviors:
 *     - Two updates resolving to the SAME cusProduct -> error, nothing executed
 *     - Any update failing target resolution (unknown plan_id) -> error, NO other
 *       update in the request is executed (all-or-nothing before Stripe writes)
 *     - Per-item validation preserved from single update-subscription:
 *       cancel_end_of_cycle on a free product -> error (atomically rejects the call)
 *       cancel_end_of_cycle on a one-off product -> error
 *     - Zod validation: empty updates array -> error; missing cancel_action -> error
 *     - Already-canceling plan CAN be canceled immediately alongside another plan
 *
 * Pre-impl red: fails at endpoint resolution (/billing.multi_update 404).
 * Post-impl green: cross-item validation in setup + per-item error handlers run
 * before any execution.
 */

import { test } from "bun:test";
import type { ApiCustomerV5, MultiUpdateParamsV0Input } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Duplicate targets rejected, nothing executed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro active; ONE multiUpdate with two updates both targeting Pro
 *
 * Expected Result:
 * - Error; Pro remains active and NOT canceling
 */
test.concurrent(
	`${chalk.yellowBright("multi update errors: duplicate targets rejected")}`,
	async () => {
		const customerId = "multi-update-err-dup";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
					customer_id: customerId,
					updates: [
						{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
						{ plan_id: pro.id, cancel_action: "cancel_immediately" },
					],
				});
			},
		});

		// ── Contract: nothing executed ────────────────────────────────────────────
		const customerAfterError =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({
			customer: customerAfterError,
			productId: pro.id,
		});
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
// TEST 2: Unknown plan in update 2 — update 1 must NOT execute (atomicity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro active; multiUpdate: [cancel Pro EOC, cancel nonexistent plan]
 *
 * Expected Result:
 * - Error (product not found); Pro remains active and NOT canceling
 */
test.concurrent(
	`${chalk.yellowBright("multi update errors: unknown plan rejects whole request")}`,
	async () => {
		const customerId = "multi-update-err-unknown";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
					customer_id: customerId,
					updates: [
						{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
						{
							plan_id: "nonexistent-plan",
							cancel_action: "cancel_immediately",
						},
					],
				});
			},
		});

		// ── Contract: atomicity — update 1 was not applied ────────────────────────
		const customerAfterError =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectProductActive({
			customer: customerAfterError,
			productId: pro.id,
		});
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
// TEST 3: Per-item validation — EOC on free product rejects atomically
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free B (non-default, no prices) + Pro A active
 * - multiUpdate: [cancel Pro A EOC (valid), cancel Free B EOC (invalid)]
 *
 * Expected Result:
 * - Error (free products cannot cancel end_of_cycle); Pro A NOT canceling
 */
test.concurrent(
	`${chalk.yellowBright("multi update errors: EOC on free product rejects whole request")}`,
	async () => {
		const customerId = "multi-update-err-free-eoc";

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const freeB = products.base({
			id: "free-b",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, freeB] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: freeB.id }),
			],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
					customer_id: customerId,
					updates: [
						{ plan_id: proA.id, cancel_action: "cancel_end_of_cycle" },
						{ plan_id: freeB.id, cancel_action: "cancel_end_of_cycle" },
					],
				});
			},
		});

		// ── Contract: atomicity — the valid update was not applied ────────────────
		const customerAfterError =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterError,
			active: [proA.id, freeB.id],
		});
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	},
);
