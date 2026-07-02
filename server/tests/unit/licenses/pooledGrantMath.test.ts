/**
 * Contract tests for the pooled license grant marker math.
 *
 * Invariants under test:
 *  - period_granted_allowance is a per-period high-water mark of desired;
 *    positive deltas grant once, decreases never claw back.
 *  - Period rolls are detected via period_key vs next_reset_at and re-baseline
 *    the marker to what the reset granted (the entitlement allowance).
 *  - desired=0 revokes (expire, balance frozen); resurrect in the same period
 *    restores the frozen balance, in a new period re-grants fresh.
 */

import { describe, expect, test } from "bun:test";
import { computePooledGrantTransition } from "@/internal/licenses/actions/pooledGrantMath.js";

const NOW = 1_700_000_000_000;
const RESET_AT = NOW + 10_000;

const state = (
	overrides: Partial<Parameters<typeof computePooledGrantTransition>[0]> = {},
) => ({
	desired: 300,
	periodGrantedAllowance: 300,
	periodKey: RESET_AT,
	currentAllowance: 300,
	nextResetAt: RESET_AT,
	expiresAt: null,
	now: NOW,
	...overrides,
});

describe("computePooledGrantTransition", () => {
	test("no change → no delta, allowance unchanged", () => {
		const t = computePooledGrantTransition(state());
		expect(t.balanceDelta).toBe(0);
		expect(t.allowance).toBe(300);
		expect(t.periodGrantedAllowance).toBe(300);
		expect(t.expireNow).toBe(false);
		expect(t.restore).toBe(false);
		expect(t.resetBalanceTo).toBeNull();
	});

	test("capacity increase grants only the positive delta", () => {
		const t = computePooledGrantTransition(state({ desired: 500 }));
		expect(t.balanceDelta).toBe(200);
		expect(t.periodGrantedAllowance).toBe(500);
		expect(t.allowance).toBe(500);
	});

	test("capacity decrease: no clawback, allowance drops for next reset", () => {
		const t = computePooledGrantTransition(state({ desired: 100 }));
		expect(t.balanceDelta).toBe(0);
		expect(t.periodGrantedAllowance).toBe(300);
		expect(t.allowance).toBe(100);
	});

	test("down-then-up within cycle mints nothing until above high-water", () => {
		const down = computePooledGrantTransition(state({ desired: 100 }));
		const backUp = computePooledGrantTransition(
			state({
				desired: 200,
				currentAllowance: down.allowance,
				periodGrantedAllowance: down.periodGrantedAllowance,
			}),
		);
		expect(backUp.balanceDelta).toBe(0);
		expect(backUp.periodGrantedAllowance).toBe(300);

		const aboveHighWater = computePooledGrantTransition(
			state({
				desired: 400,
				currentAllowance: down.allowance,
				periodGrantedAllowance: down.periodGrantedAllowance,
			}),
		);
		expect(aboveHighWater.balanceDelta).toBe(100);
		expect(aboveHighWater.periodGrantedAllowance).toBe(400);
	});

	test("period roll re-baselines marker to what the reset granted", () => {
		const NEW_RESET_AT = RESET_AT + 1_000_000;
		const t = computePooledGrantTransition(
			state({
				desired: 500,
				periodGrantedAllowance: 900,
				periodKey: RESET_AT,
				currentAllowance: 300,
				nextResetAt: NEW_RESET_AT,
			}),
		);
		expect(t.periodKey).toBe(NEW_RESET_AT);
		expect(t.balanceDelta).toBe(200);
		expect(t.periodGrantedAllowance).toBe(500);
	});

	test("revoke: desired=0 expires the grant and zeroes allowance", () => {
		const t = computePooledGrantTransition(state({ desired: 0 }));
		expect(t.expireNow).toBe(true);
		expect(t.balanceDelta).toBe(0);
		expect(t.allowance).toBe(0);
	});

	test("revoke is idempotent when already expired", () => {
		const t = computePooledGrantTransition(
			state({ desired: 0, expiresAt: NOW - 5_000 }),
		);
		expect(t.expireNow).toBe(false);
		expect(t.restore).toBe(false);
	});

	test("resurrect in same period restores frozen balance without minting", () => {
		const t = computePooledGrantTransition(
			state({ desired: 300, expiresAt: NOW - 5_000 }),
		);
		expect(t.restore).toBe(true);
		expect(t.resetBalanceTo).toBeNull();
		expect(t.balanceDelta).toBe(0);
	});

	test("resurrect in same period with higher capacity grants the delta only", () => {
		const t = computePooledGrantTransition(
			state({ desired: 400, expiresAt: NOW - 5_000 }),
		);
		expect(t.restore).toBe(true);
		expect(t.balanceDelta).toBe(100);
		expect(t.periodGrantedAllowance).toBe(400);
	});

	test("resurrect in a new period re-grants fresh and re-anchors", () => {
		const t = computePooledGrantTransition(
			state({
				desired: 200,
				expiresAt: NOW - 5_000,
				nextResetAt: NOW - 1_000,
				periodKey: NOW - 1_000,
			}),
		);
		expect(t.restore).toBe(true);
		expect(t.resetBalanceTo).toBe(200);
		expect(t.periodGrantedAllowance).toBe(200);
		expect(t.balanceDelta).toBe(0);
		expect(t.reanchorReset).toBe(true);
		expect(t.allowance).toBe(200);
	});

	test("allowance always tracks desired so the next reset grants exactly desired", () => {
		for (const desired of [0, 50, 300, 1000]) {
			const t = computePooledGrantTransition(state({ desired }));
			expect(t.allowance).toBe(desired);
		}
	});
});
