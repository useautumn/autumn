/**
 * Contract: a migration coordinator submits finite customer slices until the source is exhausted.
 * Total limits and cancellation apply across slices, and zero-progress slices cannot spin forever.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { RunMigrationChunkPayloadSchema } from "@/trigger/migrations/migrationTaskPayload.js";
import { runMigrationInChunks } from "@/trigger/migrations/runMigrationInChunks.js";

describe("runMigrationInChunks", () => {
	test("requires a frozen prepared migration snapshot for every chunk", () => {
		const migration = {
			internal_id: "migration_internal_id",
			id: "migration_id",
			org_id: "org_id",
			env: AppEnv.Sandbox,
			filter: { customer: { customer_id: { $in: ["customer_1"] } } },
			operations: {
				customer: [{ type: "add_plan" as const, plan_id: "plan_id" }],
			},
			prepared_state: {},
			no_billing_changes: true,
			retry_failed: false,
			archived: false,
			created_at: 1,
			updated_at: null,
			event_internal_id: "migration_internal_id",
		};

		const result = RunMigrationChunkPayloadSchema.parse({
			orgId: "org_id",
			env: AppEnv.Sandbox,
			migrationId: "migration_id",
			migrationRunId: "migration_run_id",
			dryRun: false,
			lazyRun: false,
			chunkIndex: 0,
			migration,
		});

		expect(result.migration).toEqual(migration);
		expect("preparedState" in result).toBe(false);
	});

	test("submits continuations until a chunk exhausts the source", async () => {
		const completions = [
			{
				processed: 2,
				completion: "slice_complete" as const,
				cursor: "customer_2",
			},
			{
				processed: 1,
				completion: "slice_complete" as const,
				cursor: "customer_3",
			},
			{ processed: 0, completion: "exhausted" as const, cursor: null },
		];
		const limits: Array<number | undefined> = [];
		const cursors: Array<string | undefined> = [];

		const result = await runMigrationInChunks({
			isCancelRequested: async () => false,
			runChunk: async ({ limit, cursor }) => {
				limits.push(limit);
				cursors.push(cursor);
				const next = completions.shift();
				if (!next) throw new Error("missing test completion");
				return next;
			},
		});

		expect(limits).toEqual([undefined, undefined, undefined]);
		expect(cursors).toEqual([undefined, "customer_2", "customer_3"]);
		expect(result).toEqual({ processed: 3, chunks: 3, canceled: false });
	});

	test("carries the remaining total limit into each continuation", async () => {
		const limits: Array<number | undefined> = [];

		const result = await runMigrationInChunks({
			limit: 3,
			isCancelRequested: async () => false,
			runChunk: async ({ limit, chunkIndex }) => {
				limits.push(limit);
				return {
					processed: limit === 3 ? 2 : 1,
					completion: "slice_complete",
					cursor: `customer_${chunkIndex + 1}`,
				};
			},
		});

		expect(limits).toEqual([3, 1]);
		expect(result).toEqual({ processed: 3, chunks: 2, canceled: false });
	});

	test("does not submit another chunk after cancellation", async () => {
		let chunkCount = 0;
		let cancelChecks = 0;

		const result = await runMigrationInChunks({
			isCancelRequested: async () => {
				cancelChecks++;
				return cancelChecks > 1;
			},
			runChunk: async () => {
				chunkCount++;
				return {
					processed: 2,
					completion: "slice_complete",
					cursor: "customer_2",
				};
			},
		});

		expect(chunkCount).toBe(1);
		expect(result).toEqual({ processed: 2, chunks: 1, canceled: true });
	});

	test("honors cancellation detected inside a chunk", async () => {
		const result = await runMigrationInChunks({
			isCancelRequested: async () => false,
			runChunk: async () => ({
				processed: 1,
				completion: "stopped",
				cursor: "customer_1",
			}),
		});

		expect(result).toEqual({ processed: 1, chunks: 1, canceled: true });
	});

	test("rejects a continuation that made no progress", async () => {
		expect(
			runMigrationInChunks({
				isCancelRequested: async () => false,
				runChunk: async () => ({
					processed: 0,
					completion: "slice_complete",
					cursor: null,
				}),
			}),
		).rejects.toThrow("made no progress");
	});

	test("rejects a continuation without a stable cursor", async () => {
		expect(
			runMigrationInChunks({
				isCancelRequested: async () => false,
				runChunk: async () => ({
					processed: 1,
					completion: "slice_complete",
					cursor: null,
				}),
			}),
		).rejects.toThrow("did not return a cursor");
	});
});
