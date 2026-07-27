/**
 * TDD tests for the V2 batch reset worker (batchResetCustomerEntitlementsV2):
 * basic reset behavior.
 *
 * Contract under test:
 *   Behaviors:
 *     - overdue free monthly ent with usage -> balance restored to allowance,
 *       adjustment 0, next_reset_at advanced per getNextResetAt (parity),
 *       cache_version incremented, one reset mutation reported
 *     - next_reset_at far in the past (multi-cycle) -> one run catches up to a
 *       future next_reset_at within one interval of now
 *     - month-boundary planted reset (Jan 31) -> advances per getNextResetAt
 *       (day-drift semantics preserved; free product, no Stripe anchor call)
 *     - unknown/deleted IDs -> no throw, zero mutations, zero verdicts
 *     - IDEMPOTENCY: re-running the worker on an already-reset (not-due) row
 *       is a no-op — balance and next_reset_at unchanged. The scanner
 *       re-enqueues across sweeps and SQS is at-least-once, so this is a hard
 *       requirement, not a nice-to-have.
 *
 * Pre-impl red expected on the idempotency test: classify has no "not due"
 * check and executeResetMutations has no optimistic guard, so a redelivery
 * double-resets (balance re-topped, next_reset_at pushed one more cycle).
 */

import { expect, test } from "bun:test";
import { customerEntitlements, EntInterval, ms } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, sql } from "drizzle-orm";
import { getNextResetAt } from "@/utils/timeUtils.js";
import {
	fetchCustomerEntitlementRow,
	runBatchResetV2,
	waitForPostgresBalance,
} from "./batchResetV2TestUtils.js";

const INCLUDED_USAGE = 100;

const initBasicScenario = async ({
	customerId,
	trackValue,
}: {
	customerId: string;
	trackValue?: number;
}) => {
	const plan = products.base({
		id: "batch-reset-basic",
		items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [
			s.attach({ productId: plan.id }),
			...(trackValue
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
		ctx: scenario.ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(customerEntitlement).toBeDefined();

	return { ...scenario, customerEntitlement: customerEntitlement! };
};

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: regular reset restores balance and advances next_reset_at")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-regular";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
			trackValue: 30,
		});

		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
			expectedBalance: INCLUDED_USAGE - 30,
		});

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});
		const rowBefore = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		// ── Contract: one reset mutation reported ───────────────────────
		expect(result.resetMutations.length).toBe(1);
		expect(result.verdicts.length).toBe(0);

		// ── Contract: balance restored, adjustment cleared ──────────────
		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.balance).toBe(INCLUDED_USAGE);
		expect(row.adjustment).toBe(0);

		// ── Contract: next_reset_at parity with getNextResetAt ──────────
		const expectedNextResetAt = getNextResetAt({
			curReset: new UTCDate(pastTime),
			interval: EntInterval.Month,
			intervalCount: 1,
		});
		expect(row.next_reset_at).toBe(expectedNextResetAt);
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());

		// ── Contract: cache_version incremented ─────────────────────────
		expect(row.cache_version!).toBe((rowBefore.cache_version ?? 0) + 1);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: multi-cycle catch-up lands within one interval of now")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-catchup";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		// ~6 months overdue — the reset must catch up several cycles at once.
		const pastTime = Date.now() - ms.days(190);
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());
		expect(row.next_reset_at!).toBeLessThanOrEqual(Date.now() + ms.days(32));
		expect(row.next_reset_at).toBe(
			getNextResetAt({
				curReset: new UTCDate(pastTime),
				interval: EntInterval.Month,
				intervalCount: 1,
			}),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: month-end boundary reset advances per getNextResetAt")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-boundary";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		// Jan 31 — month-end edge; catch-up walks Feb 28 etc. The anchor
		// day-drift math itself is unit-tested; this asserts the V2 worker
		// wires through the same helper.
		const pastTime = Date.UTC(2026, 0, 31, 10, 0, 0);
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.next_reset_at).toBe(
			getNextResetAt({
				curReset: new UTCDate(pastTime),
				interval: EntInterval.Month,
				intervalCount: 1,
			}),
		);
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: legacy entities blob with null id still resets")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-legacy-entities";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		// Real prod shape: an old bug wrote an entity under the key "null" with
		// a null id. Hydration is unvalidated by design, so the row must flow
		// through and reset instead of erroring at the head of the scan.
		await ctx.db.execute(sql`
			UPDATE ${customerEntitlements}
			SET entities = ${JSON.stringify({
				null: { id: null, balance: 50, adjustment: 0 },
			})}::jsonb
			WHERE id = ${customerEntitlement.id}
		`);

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		expect(result.resetMutations.length).toBe(1);
		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.balance).toBe(INCLUDED_USAGE);
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: unknown IDs are handled without mutations")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-missing";
		const { ctx } = await initBasicScenario({ customerId });

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: ["cus_ent_does_not_exist_v2_test"],
		});

		expect(result.resetMutations.length).toBe(0);
		expect(result.verdicts.length).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: redelivery of an already-reset row is a no-op")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-idempotent";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const rowAfterFirstReset = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rowAfterFirstReset.balance).toBe(INCLUDED_USAGE);

		// Usage after the reset — a second (redelivered) run must NOT wipe it.
		await ctx.db
			.update(customerEntitlements)
			.set({ balance: INCLUDED_USAGE - 10 })
			.where(eq(customerEntitlements.id, customerEntitlement.id));

		const secondRun = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		// ── Contract: not-due row produces no mutation ───────────────────
		expect(secondRun.resetMutations.length).toBe(0);

		const rowAfterSecondRun = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		// Balance written between runs survives; next_reset_at not pushed
		// another cycle forward.
		expect(rowAfterSecondRun.balance).toBe(INCLUDED_USAGE - 10);
		expect(rowAfterSecondRun.next_reset_at).toBe(
			rowAfterFirstReset.next_reset_at,
		);
	},
);
