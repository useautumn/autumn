import { describe, expect, test } from "bun:test";
import {
	assertRolloutInactive,
	scheduleRolloutPercent,
} from "@/internal/misc/rollouts/rolloutConfigStore.js";
import type {
	RolloutEntry,
	RolloutPercent,
} from "@/internal/misc/rollouts/rolloutSchemas.js";
import { ROLLOUT_SETTLE_MS } from "@/internal/misc/rollouts/rolloutUtils.js";

const ROLLOUT_ID = "balance-worker";

const entryWith = ({
	percent,
	orgPercents = {},
}: {
	percent: number;
	orgPercents?: Record<string, number>;
}): RolloutEntry => ({
	percent,
	previousPercent: 0,
	changedAt: 0,
	decreases: [],
	orgs: Object.fromEntries(
		Object.entries(orgPercents).map(([orgId, orgPercent]) => [
			orgId,
			{
				percent: orgPercent,
				previousPercent: 0,
				changedAt: 0,
				decreases: [],
			},
		]),
	),
});

describe("assertRolloutInactive", () => {
	test("a missing entry passes", () => {
		expect(() =>
			assertRolloutInactive({ rolloutId: ROLLOUT_ID, entry: undefined }),
		).not.toThrow();
	});

	test("an entry at 0 with every org at 0 passes", () => {
		expect(() =>
			assertRolloutInactive({
				rolloutId: ROLLOUT_ID,
				entry: entryWith({ percent: 0, orgPercents: { org_a: 0 } }),
			}),
		).not.toThrow();
	});

	test("a non-zero global percent is refused", () => {
		expect(() =>
			assertRolloutInactive({
				rolloutId: ROLLOUT_ID,
				entry: entryWith({ percent: 10 }),
			}),
		).toThrow(/still active/);
	});

	test("a non-zero org override is refused even when the global is 0", () => {
		expect(() =>
			assertRolloutInactive({
				rolloutId: ROLLOUT_ID,
				entry: entryWith({ percent: 0, orgPercents: { org_a: 100 } }),
			}),
		).toThrow(/still active/);
	});
});

describe("scheduleRolloutPercent", () => {
	const T = 1_700_000_000_000;
	const day = 86_400_000;
	const at = ({
		percent,
		previousPercent,
		changedAt,
		decreases = [],
	}: {
		percent: number;
		previousPercent: number;
		changedAt: number;
		decreases?: RolloutPercent["decreases"];
	}): RolloutPercent => ({ percent, previousPercent, changedAt, decreases });

	test("a new org override inherits the global percent and records the drop", () => {
		const global = {
			...at({ percent: 100, previousPercent: 0, changedAt: T - 60_000 }),
			orgs: {},
		};
		expect(
			scheduleRolloutPercent({ current: global, percent: 0, now: T }),
		).toEqual({
			previousPercent: 100,
			percent: 0,
			changedAt: T,
			decreases: [{ from: 100, to: 0, at: T }],
		});
	});

	test("a change inside an unsettled window starts from the percent still routing", () => {
		const unsettled = at({
			percent: 100,
			previousPercent: 0,
			changedAt: T - 1_000,
		});
		expect(
			scheduleRolloutPercent({ current: unsettled, percent: 50, now: T }),
		).toEqual({
			previousPercent: 0,
			percent: 50,
			changedAt: T,
			decreases: [],
		});
	});

	test("increases record nothing; decreases accumulate and expire with the view TTL", () => {
		const settled = at({
			percent: 100,
			previousPercent: 0,
			changedAt: T - ROLLOUT_SETTLE_MS,
		});
		const down = scheduleRolloutPercent({
			current: settled,
			percent: 50,
			now: T,
		});
		const up = scheduleRolloutPercent({
			current: down,
			percent: 75,
			now: T + day,
		});
		expect(up.decreases).toEqual([{ from: 100, to: 50, at: T }]);
		const downAgain = scheduleRolloutPercent({
			current: up,
			percent: 0,
			now: T + 2 * day,
		});
		expect(downAgain.decreases).toEqual([
			{ from: 100, to: 50, at: T },
			{ from: 75, to: 0, at: T + 2 * day },
		]);
		const muchLater = scheduleRolloutPercent({
			current: downAgain,
			percent: 10,
			now: T + 10 * day,
		});
		expect(muchLater.decreases).toEqual([]);
	});
});
