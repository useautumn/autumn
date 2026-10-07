// Contract: a slice's continuation cursor never re-exposes a customer already handled in the same run.
// Retry runs re-claim failed rows, so a cursor behind a failed customer would migrate it twice.
import { describe, expect, test } from "bun:test";
import { iterateScope } from "@/internal/migrations/v2/run/orchestrators/iterateScope.js";
import type { MigrationRunScheduler } from "@/internal/migrations/v2/run/types/migrationRunScheduler.js";
import type { RunScopeItem } from "@/internal/migrations/v2/run/types/runScope.js";

const customerIds = ["c9", "c8", "c7", "c6", "c5"];
const finishDelayMs: Record<string, number> = { c9: 40, c8: 0, c7: 20 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("iterateScope retry-run cursor", () => {
	test("a retry run never re-claims a customer that failed earlier in the same run", async () => {
		const statuses = new Map<string, "running" | "succeeded" | "failed">();
		const claims: string[] = [];
		const retryStatuses = new Set(["failed"]);
		const scheduler: MigrationRunScheduler = {
			batchSize: 100,
			sliceDurationMs: 0,
			now: Date.now,
		};

		// Keyset on internal_id DESC; the checkpoint keeps only unprocessed or retryable rows.
		const iterateFrom = (cursor: string | null) =>
			async function* (): AsyncGenerator<RunScopeItem[]> {
				yield customerIds
					.filter((id) => cursor === null || id < cursor)
					.filter((id) => {
						const status = statuses.get(id);
						return status === undefined || retryStatuses.has(status);
					})
					.map((id) => ({ kind: "customer", internal_id: id, id }));
			};

		const perItem = async (item: RunScopeItem) => {
			const status = statuses.get(item.internal_id);
			if (status !== undefined && !retryStatuses.has(status)) return;
			claims.push(item.internal_id);
			statuses.set(item.internal_id, "running");
			await sleep(finishDelayMs[item.internal_id] ?? 0);
			if (item.internal_id === "c8") {
				statuses.set(item.internal_id, "failed");
				throw new Error("customer failed");
			}
			statuses.set(item.internal_id, "succeeded");
		};

		const firstSlice = await iterateScope({
			iterate: iterateFrom(null),
			perItem,
			concurrency: 3,
			scheduler,
		});
		expect(firstSlice.completion).toBe("slice_complete");

		await iterateScope({
			iterate: iterateFrom(firstSlice.cursor),
			perItem,
			concurrency: 3,
		});

		expect(claims.filter((id) => id === "c8")).toHaveLength(1);
		expect([...claims].sort()).toEqual([...customerIds].sort());
	});
});
