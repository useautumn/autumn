import { expect, test } from "bun:test";
import { endRunWorkers, insertRunWorker } from "./runWorkersRepo.ts";

const fakeCtx = () => {
	const inserted: Record<string, unknown>[] = [];
	const updated: Record<string, unknown>[] = [];
	const ctx = {
		db: {
			insert: () => ({
				values: async (row: Record<string, unknown>) => inserted.push(row),
			}),
			update: () => ({
				set: (row: Record<string, unknown>) => ({
					where: async () => updated.push(row),
				}),
			}),
		},
	};
	return { ctx: ctx as never, inserted, updated };
};

test("a worker's lifetime starts when its create was requested, not when the row is written", async () => {
	const { ctx, inserted } = fakeCtx();
	const createdAt = new Date("2026-10-01T11:12:58.000Z");
	await insertRunWorker({
		ctx,
		runId: "run_1",
		name: "tw-twd-run_1-0",
		sandboxId: "sb-1",
		accountId: "acct_1",
		startedAt: createdAt,
	});
	expect(inserted[0]).toMatchObject({ startedAt: createdAt, cores: 2 });
});

test("a retired worker's lifetime ends when its terminate returned", async () => {
	const { ctx, updated } = fakeCtx();
	const terminatedAt = new Date("2026-10-01T11:23:13.000Z");
	await endRunWorkers({
		ctx,
		runId: "run_1",
		name: "tw-twd-run_1-0",
		endedAt: terminatedAt,
	});
	expect(updated[0]).toEqual({ endedAt: terminatedAt });
});

test("closing a run's remaining workers stamps now", async () => {
	const { ctx, updated } = fakeCtx();
	const before = Date.now();
	await endRunWorkers({ ctx, runId: "run_1" });
	expect((updated[0]?.endedAt as Date).getTime()).toBeGreaterThanOrEqual(
		before,
	);
});
