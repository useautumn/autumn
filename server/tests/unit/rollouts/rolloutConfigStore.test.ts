import { describe, expect, test } from "bun:test";
import { assertRolloutInactive } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import type { RolloutEntry } from "@/internal/misc/rollouts/rolloutSchemas.js";

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
	orgs: Object.fromEntries(
		Object.entries(orgPercents).map(([orgId, orgPercent]) => [
			orgId,
			{ percent: orgPercent, previousPercent: 0, changedAt: 0 },
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
