import { expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { endRunWorkers, insertRunWorker } from "./runWorkersRepo.ts";

const fakeCtx = () => {
	const inserted: Record<string, unknown>[] = [];
	const updated: { set: Record<string, unknown>; where: SQL }[] = [];
	const ctx = {
		db: {
			insert: () => ({
				values: async (row: Record<string, unknown>) => inserted.push(row),
			}),
			update: () => ({
				set: (set: Record<string, unknown>) => ({
					where: async (where: SQL) => updated.push({ set, where }),
				}),
			}),
		},
	};
	return { ctx: ctx as never, inserted, updated };
};
const render = (where: SQL) => new PgDialect().sqlToQuery(where);

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
	expect(inserted[0]?.startedAt).toBe(createdAt);
});

test("a retired worker's lifetime ends when its terminate returned, on its own open row only", async () => {
	const { ctx, updated } = fakeCtx();
	const terminatedAt = new Date("2026-10-01T11:23:13.000Z");
	await endRunWorkers({
		ctx,
		runId: "run_1",
		name: "tw-twd-run_1-0",
		endedAt: terminatedAt,
	});
	expect(updated[0]?.set).toEqual({ endedAt: terminatedAt });
	const { sql, params } = render(updated[0]?.where as SQL);
	expect(sql).toContain('"ended_at" is null');
	expect(params).toEqual(["run_1", "tw-twd-run_1-0"]);
});

test("closing a run's remaining workers stamps now on every open row of that run", async () => {
	const { ctx, updated } = fakeCtx();
	const before = Date.now();
	await endRunWorkers({ ctx, runId: "run_1" });
	expect((updated[0]?.set.endedAt as Date).getTime()).toBeGreaterThanOrEqual(
		before,
	);
	const { sql, params } = render(updated[0]?.where as SQL);
	expect(sql).toContain('"ended_at" is null');
	expect(params).toEqual(["run_1"]);
});
