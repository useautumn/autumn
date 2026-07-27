/**
 * TDD tests for the V2 batch reset worker (batchResetCustomerEntitlementsV2):
 * rollover creation and cap enforcement at reset time.
 *
 * Contract under test:
 *   Behaviors:
 *     - unused balance below the cap rolls over in full; cusEnt balance
 *       returns to the allowance
 *     - `max` cap: rollover is clamped to min(unused, max)
 *     - `max_percentage` cap: rollover is clamped to pct of the allowance
 *     - Month duration: rollover expires_at = old next_reset_at + length
 *       months; Forever duration: expires_at is null
 *     - multi-cycle accumulation (Forever + max): total rollover balance
 *       across repeated resets stays <= max — exercises the V2
 *       performMaximumClearing + upsert/delete execute path
 *     - entity-scoped ents: each entity's balance resets to the allowance and
 *       rolls over per entity into rollover.entities
 *   Side effects:
 *     - rollover rows live in the `rollovers` table keyed by cus_ent_id
 */

import { expect, test } from "bun:test";
import {
	ProductItemInterval,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	fetchCustomerEntitlementRow,
	fetchRollovers,
	runBatchResetV2,
	waitForPostgresBalance,
} from "./batchResetV2TestUtils.js";

const INCLUDED_USAGE = 100;

/** Attach a free monthly-messages plan with the given rollover config, track
 * usage, wait for PG sync, expire, and return everything needed to reset. */
const initRolloverScenario = async ({
	customerId,
	rolloverConfig,
	trackValue,
}: {
	customerId: string;
	rolloverConfig: RolloverConfig;
	trackValue: number;
}) => {
	const plan = products.base({
		id: "batch-reset-rollover",
		items: [
			items.monthlyMessagesWithRollover({
				includedUsage: INCLUDED_USAGE,
				rolloverConfig,
			}),
		],
	});

	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [
			s.attach({ productId: plan.id }),
			...(trackValue > 0
				? [
						s.track({
							featureId: TestFeature.Messages,
							value: trackValue,
							timeout: 3000,
						}),
					]
				: []),
		],
	});

	const customerEntitlement = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(customerEntitlement).toBeDefined();

	if (trackValue > 0) {
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
			expectedBalance: INCLUDED_USAGE - trackValue,
		});
	}

	const pastTime = Date.now() - 1000;
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
		pastTimeMs: pastTime,
	});

	return { ctx, customerEntitlement: customerEntitlement!, pastTime };
};

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: unused balance below cap rolls over in full with Month expiry")}`,
	async () => {
		const { ctx, customerEntitlement, pastTime } = await initRolloverScenario({
			customerId: "batch-reset-v2-rollover-under-cap",
			rolloverConfig: {
				max: 50,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
			trackValue: 70, // remaining 30 < max 50
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		// ── Contract: balance back to allowance ─────────────────────────
		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.balance).toBe(INCLUDED_USAGE);

		// ── Contract: one rollover row with full unused balance ─────────
		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rolloverRows.length).toBe(1);
		expect(rolloverRows[0].balance).toBe(30);

		// ── Contract: Month expiry = old next_reset_at + 1 month ────────
		expect(rolloverRows[0].expires_at).toBe(addMonths(pastTime, 1).getTime());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: max cap clamps the rolled-over balance")}`,
	async () => {
		const { ctx, customerEntitlement, pastTime } = await initRolloverScenario({
			customerId: "batch-reset-v2-rollover-max-cap",
			rolloverConfig: {
				max: 50,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
			trackValue: 20, // remaining 80 > max 50
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		const totalRollover = rolloverRows.reduce(
			(total, rolloverRow) => total + (rolloverRow.balance ?? 0),
			0,
		);
		expect(totalRollover).toBe(50);
		// Clamping must not disturb the expiry of the surviving row.
		expect(rolloverRows[0].expires_at).toBe(addMonths(pastTime, 1).getTime());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: max_percentage clamps to pct of allowance")}`,
	async () => {
		const { ctx, customerEntitlement, pastTime } = await initRolloverScenario({
			customerId: "batch-reset-v2-rollover-percentage",
			rolloverConfig: {
				max_percentage: 50,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
			trackValue: 0, // remaining 100, pct cap = 50
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		const totalRollover = rolloverRows.reduce(
			(total, rolloverRow) => total + (rolloverRow.balance ?? 0),
			0,
		);
		expect(totalRollover).toBe(50);
		expect(rolloverRows[0].expires_at).toBe(addMonths(pastTime, 1).getTime());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: multi-month length sets expires_at length months out")}`,
	async () => {
		const { ctx, customerEntitlement, pastTime } = await initRolloverScenario({
			customerId: "batch-reset-v2-rollover-length-3",
			rolloverConfig: {
				max: 50,
				length: 3,
				duration: RolloverExpiryDurationType.Month,
			},
			trackValue: 70, // remaining 30 < max 50
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rolloverRows.length).toBe(1);
		expect(rolloverRows[0].balance).toBe(30);
		// ── Contract: expiry = old next_reset_at + `length` months ──────
		expect(rolloverRows[0].expires_at).toBe(addMonths(pastTime, 3).getTime());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: Forever duration produces a null expires_at")}`,
	async () => {
		const { ctx, customerEntitlement } = await initRolloverScenario({
			customerId: "batch-reset-v2-rollover-forever",
			rolloverConfig: {
				max: 1000,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
			trackValue: 60, // remaining 40
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rolloverRows.length).toBe(1);
		expect(rolloverRows[0].balance).toBe(40);
		expect(rolloverRows[0].expires_at).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: multi-cycle accumulation stays capped at max")}`,
	async () => {
		const customerId = "batch-reset-v2-rollover-multi-cycle";
		const INCLUDED = 300;
		const ROLLOVER_MAX = 450;
		const RESET_CYCLES = 3;

		const fairUseItem = constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: INCLUDED,
			interval: ProductItemInterval.Hour,
			intervalCount: 5,
			rolloverConfig: {
				max: ROLLOVER_MAX,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
		});
		const plan = products.base({
			id: "rollover-multi-cycle",
			items: [fairUseItem],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();

		// Full INCLUDED rolls over every cycle; without cap clearing the total
		// would reach RESET_CYCLES * INCLUDED = 900, blowing past max 450.
		for (let cycle = 0; cycle < RESET_CYCLES; cycle++) {
			await expireCusEntForReset({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
				pastTimeMs: Date.now() - 1000,
			});
			await runBatchResetV2({
				ctx,
				customerEntitlementIds: [customerEntitlement!.id],
			});
		}

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		const totalRollover = rolloverRows.reduce(
			(total, rolloverRow) => total + (rolloverRow.balance ?? 0),
			0,
		);
		// ── Contract: EXACT clearing math — 300, 600→450, 750→450 ───────
		expect(totalRollover).toBe(ROLLOVER_MAX);
		expect(rolloverRows.length).toBeLessThanOrEqual(RESET_CYCLES);
		// Forever duration: every surviving row keeps a null expiry.
		for (const rolloverRow of rolloverRows) {
			expect(rolloverRow.expires_at).toBeNull();
		}

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(row.balance).toBe(INCLUDED);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: max clearing trims the earliest-expiring row first")}`,
	async () => {
		const customerId = "batch-reset-v2-rollover-clearing-order";
		const ROLLOVER_MAX = 150;

		const plan = products.base({
			id: "rollover-clearing-order",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: INCLUDED_USAGE,
					rolloverConfig: {
						max: ROLLOVER_MAX,
						length: 1,
						duration: RolloverExpiryDurationType.Month,
					},
				}),
			],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();

		// Cycle 1: rolls the full 100 with expiry = firstPastTime + 1 month.
		const firstPastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: firstPastTime,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		// Cycle 2: rolls another 100 (total 200) → clearing must trim the 50
		// excess from the EARLIEST-expiring row (cycle 1's), not cycle 2's.
		const secondPastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: secondPastTime,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(rolloverRows.length).toBe(2);

		const sortedRows = [...rolloverRows].sort(
			(a, b) => (a.expires_at ?? 0) - (b.expires_at ?? 0),
		);
		// ── Contract: earliest-expiring row trimmed to absorb the excess ─
		expect(sortedRows[0].balance).toBe(50);
		expect(sortedRows[0].expires_at).toBe(
			addMonths(firstPastTime, 1).getTime(),
		);
		// ── Contract: newest row untouched, expiry from its own cycle ───
		expect(sortedRows[1].balance).toBe(INCLUDED_USAGE);
		expect(sortedRows[1].expires_at).toBe(
			addMonths(secondPastTime, 1).getTime(),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 rollovers: entity-scoped balances reset and roll over per entity")}`,
	async () => {
		const customerId = "batch-reset-v2-rollover-entity";

		const entityScopedItem = constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: INCLUDED_USAGE,
			entityFeatureId: TestFeature.Users,
			rolloverConfig: {
				max: 1000,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		const plan = products.base({
			id: "rollover-entity",
			items: [entityScopedItem],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 40,
					entityIndex: 0,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();

		// Wait for the entity deduction to land in PG (Redis-path sync lag).
		const startedAt = Date.now();
		while (true) {
			const row = await fetchCustomerEntitlementRow({
				db: ctx.db,
				customerEntitlementId: customerEntitlement!.id,
			});
			const balances = Object.values(row.entities ?? {});
			if (balances.some((entity) => entity.balance === INCLUDED_USAGE - 40)) {
				break;
			}
			if (Date.now() - startedAt > 15_000) {
				throw new Error(
					`entity deduction never synced to PG: ${JSON.stringify(row.entities)}`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		// ── Contract: every entity balance reset to the allowance ───────
		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		const entityBalances = Object.values(row.entities ?? {});
		expect(entityBalances.length).toBe(2);
		for (const entity of entityBalances) {
			expect(entity.balance).toBe(INCLUDED_USAGE);
			expect(entity.adjustment).toBe(0);
		}

		// ── Contract: per-entity rollover amounts (60 and 100) ──────────
		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(rolloverRows.length).toBe(1);
		const rolloverEntities = Object.values(
			(rolloverRows[0].entities ?? {}) as Record<string, { balance: number }>,
		);
		const rolloverBalances = rolloverEntities
			.map((entity) => entity.balance)
			.sort((a, b) => a - b);
		expect(rolloverBalances).toEqual([INCLUDED_USAGE - 40, INCLUDED_USAGE]);
		// ── Contract: entity rollover carries the Month expiry too ──────
		expect(rolloverRows[0].expires_at).toBe(addMonths(pastTime, 1).getTime());
	},
);
