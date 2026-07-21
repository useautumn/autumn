// Contract: scheduled migration scopes run one customer at a time and yield only between customers after a time slice.
// A completed final customer must not cause an unnecessary yield.
import { describe, expect, test } from "bun:test";
import { iterateScope } from "@/internal/migrations/v2/run/orchestrators/iterateScope.js";
import type { MigrationRunScheduler } from "@/internal/migrations/v2/run/types/migrationRunScheduler.js";
import type { RunScopeItem } from "@/internal/migrations/v2/run/types/runScope.js";

const customerItem = (id: string): RunScopeItem => ({
	kind: "customer",
	internal_id: `internal_${id}`,
	id,
});

const iterateItems = (items: RunScopeItem[]) =>
	async function* iterate(): AsyncGenerator<RunScopeItem[]> {
		yield items;
	};

describe("iterateScope migration scheduling", () => {
	test("forces sequential customer execution when a scheduler is present", async () => {
		let active = 0;
		let maxActive = 0;
		const scheduler: MigrationRunScheduler = {
			sliceDurationMs: Number.POSITIVE_INFINITY,
			now: () => 0,
			onSliceComplete: async () => {},
		};

		await iterateScope({
			iterate: iterateItems([
				customerItem("customer_1"),
				customerItem("customer_2"),
				customerItem("customer_3"),
			]),
			concurrency: 3,
			scheduler,
			perItem: async () => {
				active++;
				maxActive = Math.max(maxActive, active);
				await Promise.resolve();
				active--;
				return undefined;
			},
		});

		expect(maxActive).toBe(1);
	});

	test("yields between customers after the time slice without yielding after the final customer", async () => {
		let nowMs = 0;
		const events: string[] = [];
		const scheduler: MigrationRunScheduler = {
			sliceDurationMs: 10,
			now: () => nowMs,
			onSliceComplete: async () => {
				events.push("yield");
				nowMs += 5;
			},
		};

		await iterateScope({
			iterate: iterateItems([
				customerItem("customer_1"),
				customerItem("customer_2"),
				customerItem("customer_3"),
			]),
			scheduler,
			perItem: async (item) => {
				events.push(item.id ?? item.internal_id);
				nowMs += 6;
				return undefined;
			},
		});

		expect(events).toEqual(["customer_1", "customer_2", "yield", "customer_3"]);
	});
});
