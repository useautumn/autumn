/**
 * TDD feature test for `next_reset_at` as a create-balance parameter.
 *
 * Contract under test:
 *   New field on POST /balances/create:
 *     - next_reset_at?: number (unix ms) — explicit timestamp for the FIRST reset
 *       boundary, allowing a custom (e.g. short) first period. Requires `reset`.
 *   New behaviors:
 *     - create with reset + next_reset_at -> the cusEnt's next_reset_at equals the
 *       provided value verbatim (NOT the derived `now + interval`).
 *     - deduction does not move next_reset_at.
 *     - when next_reset_at passes, the balance refills AND the next boundary is
 *       anchored on the prior boundary + one interval (NOT `now + interval`),
 *       i.e. periods stay aligned to the custom first boundary.
 *   New validation:
 *     - next_reset_at without `reset` -> rejected.
 *     - next_reset_at in the past -> rejected (would immediately cycle the balance).
 *     - next_reset_at >= expires_at -> rejected (next reset must precede expiry).
 *
 * Pre-impl red:
 *   - `next_reset_at` is not in CreateBalanceParamsV0Schema, so zod strips it and
 *     prepareNewBalanceForInsertion derives next_reset_at = now + interval. The
 *     verbatim-equality assertion fails.
 *   - No validation exists, so both rejection assertions fail (calls succeed).
 *
 * Post-impl green:
 *   - Schema accepts next_reset_at; prepareNewBalanceForInsertion applies it;
 *     validateCreateBalanceParams enforces the two rules.
 *
 * Clock note: a create-balance cusEnt is a "free" (price-less) entitlement, so it
 * resets via the LAZY path (next_reset_at < Date.now() on read) — the Stripe test
 * clock does not drive it. We simulate the boundary passing with
 * `expireCusEntForReset` (stamps next_reset_at into the past across PG + both Redis
 * caches); the next read fires the lazy reset.
 */

import { expect, test } from "bun:test";
import { type CheckResponseV2, ResetInterval } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { add } from "date-fns";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const checkBalance = async (autumn: AutumnInt, customerId: string) => {
	const res = (await autumn.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;
	return res.balance?.current_balance;
};

// ─────────────────────────────────────────────────────────────────────────────
// Happy path: create (t0) -> deduct (t1) -> reset (t5)
//   t0: 50/50, next_reset = t5 (custom short first period), interval = 1 month
//   t1: use 10 -> 40/50, next_reset still t5
//   t5: boundary passes -> 50/50, next_reset = t5 + 1 month  (~t15)
// ─────────────────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: custom first period, reset re-anchors on boundary + interval")}`,
	async () => {
		const customerId = "create-balance-nra-happy";

		const { autumnV1, autumnV2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		// ── t0: create loose balance with explicit next_reset_at ────────────────
		// "5t" first period: 10 days out — deliberately shorter than the 1-month
		// ("10t") interval, which is only possible via the new param.
		const customNextResetAt = Date.now() + 10 * DAY_MS;

		await autumnV1.post("/balances/create", {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 50,
			reset: { interval: ResetInterval.Month },
			next_reset_at: customNextResetAt,
		});

		// Contract: next_reset_at honored verbatim (pre-fix: derived ~now+1month)
		const t0Balance = await checkBalance(autumnV2, customerId);
		expect(t0Balance).toBe(50);

		const t0CusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(t0CusEnt).toBeDefined();
		expect(t0CusEnt!.next_reset_at).toBe(customNextResetAt);

		// ── t1: use 10 -> 40/50, boundary unchanged ─────────────────────────────
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const t1Balance = await checkBalance(autumnV2, customerId);
		expect(t1Balance).toBe(40);

		const t1CusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(t1CusEnt!.next_reset_at).toBe(customNextResetAt);

		// ── t5: simulate the boundary passing ───────────────────────────────────
		// Stamp the boundary 5 days in the past so the re-anchored next boundary
		// (pastBoundary + 1 month) lands measurably BEFORE `now + 1 month`,
		// making "anchored on boundary, not on now" a real assertion.
		const pastBoundary = Date.now() - 5 * DAY_MS;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastBoundary,
		});

		// Read triggers lazy reset -> balance refills to 50
		const t5Balance = await checkBalance(autumnV2, customerId);
		expect(t5Balance).toBe(50);

		const t5CusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(t5CusEnt!.next_reset_at).toBeGreaterThan(Date.now());

		// Anchored on the prior boundary + one interval (≈ t15)…
		const expectedNext = add(new UTCDate(pastBoundary), {
			months: 1,
		}).getTime();
		expect(Math.abs(t5CusEnt!.next_reset_at! - expectedNext)).toBeLessThan(
			DAY_MS,
		);
		// …and provably NOT `now + interval` (which would be ~5 days later).
		const nowPlusInterval = add(new UTCDate(), { months: 1 }).getTime();
		expect(t5CusEnt!.next_reset_at!).toBeLessThan(nowPlusInterval - 3 * DAY_MS);
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// Validation: next_reset_at requires a reset
// ─────────────────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: rejected without a reset interval")}`,
	async () => {
		const customerId = "create-balance-nra-no-reset";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expect(
			autumnV1.post("/balances/create", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 50,
				// no `reset`
				next_reset_at: Date.now() + 10 * DAY_MS,
			}),
		).rejects.toThrow();
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// Validation: next_reset_at must be in the future
// ─────────────────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: rejected when in the past")}`,
	async () => {
		const customerId = "create-balance-nra-past";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expect(
			autumnV1.post("/balances/create", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 50,
				reset: { interval: ResetInterval.Month },
				next_reset_at: Date.now() - 10 * DAY_MS, // already elapsed
			}),
		).rejects.toThrow();
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// Validation: next_reset_at must precede expires_at
// ─────────────────────────────────────────────────────────────────────────────
test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: rejected when it occurs at/after expires_at")}`,
	async () => {
		const customerId = "create-balance-nra-after-expiry";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const nextResetAt = Date.now() + 20 * DAY_MS;
		const expiresAt = Date.now() + 10 * DAY_MS; // expiry BEFORE next reset -> invalid

		await expect(
			autumnV1.post("/balances/create", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 50,
				reset: { interval: ResetInterval.Month },
				next_reset_at: nextResetAt,
				expires_at: expiresAt,
			}),
		).rejects.toThrow();
	},
);
