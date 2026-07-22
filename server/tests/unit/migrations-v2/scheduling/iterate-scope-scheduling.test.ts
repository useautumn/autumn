// Contract: scheduled scopes run one customer at a time and finish the task only between customers.
// Exhausting the source on the final customer must not request an unnecessary continuation.
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
			batchSize: 100,
			sliceDurationMs: Number.POSITIVE_INFINITY,
			now: () => 0,
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

	test("ends a slice between customers after the time budget", async () => {
		let nowMs = 0;
		const events: string[] = [];
		const scheduler: MigrationRunScheduler = {
			batchSize: 100,
			sliceDurationMs: 10,
			now: () => nowMs,
		};

		const summary = await iterateScope({
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

		expect(events).toEqual(["customer_1", "customer_2"]);
		expect(summary.completion).toBe("slice_complete");
		expect(summary.processed).toBe(2);
		expect(summary.cursor).toBe("internal_customer_2");
	});

	test("reports exhaustion instead of continuing after the final customer", async () => {
		let nowMs = 0;
		const scheduler: MigrationRunScheduler = {
			batchSize: 100,
			sliceDurationMs: 10,
			now: () => nowMs,
		};

		const summary = await iterateScope({
			iterate: iterateItems([
				customerItem("customer_1"),
				customerItem("customer_2"),
			]),
			scheduler,
			perItem: async () => {
				nowMs += 6;
				return undefined;
			},
		});

		expect(summary.completion).toBe("exhausted");
		expect(summary.processed).toBe(2);
		expect(summary.cursor).toBe("internal_customer_2");
	});

	test("stops source consumption when the caller requests cancellation", async () => {
		let stopRequested = false;
		const processed: string[] = [];

		const summary = await iterateScope({
			iterate: iterateItems([
				customerItem("customer_1"),
				customerItem("customer_2"),
			]),
			shouldStop: () => stopRequested,
			perItem: async (item) => {
				processed.push(item.id ?? item.internal_id);
				stopRequested = true;
				return undefined;
			},
		});

		expect(processed).toEqual(["customer_1"]);
		expect(summary.completion).toBe("stopped");
	});
});
