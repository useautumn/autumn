import { expect, test } from "bun:test";
import { summariseAccountDemand } from "./summariseAccountDemand.ts";

const demands = new Map<string, number>([
	["asking", 30],
	["asking_capped", 5],
]);
const demandOf = (runId: string) => demands.get(runId);

test("a warming run's slots wait on its image, not on accounts", () => {
	expect(
		summariseAccountDemand({
			liveRuns: [{ id: "warming", status: "warming", workersWanted: 160 }],
			heldByRun: new Map(),
			demandOf,
		}),
	).toEqual({ accountsWanted: 0, slotsAwaitingWarm: 160 });
});

test("only runs registered with the allocator count as account demand, capped by what they can use", () => {
	expect(
		summariseAccountDemand({
			liveRuns: [
				{ id: "asking", status: "queued", workersWanted: 40 },
				{ id: "asking_capped", status: "running", workersWanted: 40 },
				{ id: "not_asking", status: "running", workersWanted: 40 },
				{ id: "unsized", status: "queued", workersWanted: null },
			],
			heldByRun: new Map([
				["asking", 4],
				["asking_capped", 20],
				["not_asking", 10],
			]),
			demandOf,
		}),
	).toEqual({ accountsWanted: 30 + 5, slotsAwaitingWarm: 0 });
});
