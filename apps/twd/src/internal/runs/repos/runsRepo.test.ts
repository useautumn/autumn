import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type RunStatus, runs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	peakWorkersSql,
	type RunRow,
	toRunSummary,
	updateRun,
} from "./runsRepo.ts";

const runRow = ({
	status,
	workerCount,
}: {
	status: RunStatus;
	workerCount: number | null;
}): RunRow => ({
	id: "run_1",
	branch: "dev",
	sha: "abc123",
	pinnedSha: false,
	selection: { groups: ["core"] },
	status,
	purpose: "baseline",
	isBaseline: true,
	newFailures: null,
	workersWanted: 588,
	maxWorkers: null,
	maxFilesPerWorker: null,
	sizing: null,
	repeat: 1,
	costUsd: 0,
	workerSeconds: 0,
	jobId: null,
	fileCount: 588,
	workerCount,
	passed: 0,
	failed: 0,
	progress: {},
	createdBy: "system",
	via: "system",
	createdAt: new Date("2026-10-06T17:00:00.000Z"),
	startedAt: new Date("2026-10-06T17:00:05.000Z"),
	finishedAt: null,
});

test("a live run reports the workers attached right now", () => {
	const summary = toRunSummary({
		run: runRow({ status: "running", workerCount: 31 }),
		email: null,
		peakWorkers: 40,
	});
	expect(summary.workerCount).toBe(31);
	expect(summary.workersWanted).toBe(588);
});

test("a finished run reports the most workers attached at once, not one per file", () => {
	const summary = toRunSummary({
		run: runRow({ status: "passed", workerCount: 0 }),
		email: null,
		peakWorkers: 31,
	});
	expect(summary.workerCount).toBe(31);
	expect(summary.workersWanted).toBe(588);
});

const testDatabaseUrl = process.env.TWD_TEST_DATABASE_URL;

test.skipIf(!testDatabaseUrl)(
	"peak workers counts overlapping lifetimes, not every worker the run booted",
	async () => {
		const schemaName = `twd_peak_${crypto.randomUUID().replaceAll("-", "")}`;
		const admin = postgres(testDatabaseUrl as string, {
			max: 1,
			onnotice: () => {},
		});
		await admin.unsafe(`create schema ${schemaName}`);
		const client = postgres(testDatabaseUrl as string, {
			max: 1,
			connection: { search_path: schemaName },
		});
		try {
			await client.unsafe(
				"create table runs (id text primary key, finished_at timestamptz); create table run_workers (run_id text not null, started_at timestamptz not null, ended_at timestamptz)",
			);
			const at = (second: number) =>
				new Date(Date.UTC(2026, 9, 6, 17, 0, second)).toISOString();
			await client`insert into runs ${client([
				{ id: "run_waves", finished_at: at(59) },
				{ id: "run_open", finished_at: null },
				{ id: "run_none", finished_at: at(59) },
			])}`;
			// run_waves: 3 overlap, then a fourth starts the instant one ends, then a lone straggler.
			// run_open: still running, so its open workers are all attached.
			await client`insert into run_workers ${client([
				{ run_id: "run_waves", started_at: at(0), ended_at: at(10) },
				{ run_id: "run_waves", started_at: at(1), ended_at: at(20) },
				{ run_id: "run_waves", started_at: at(2), ended_at: null },
				{ run_id: "run_waves", started_at: at(10), ended_at: at(15) },
				{ run_id: "run_waves", started_at: at(30), ended_at: at(40) },
				{ run_id: "run_open", started_at: at(0), ended_at: at(5) },
				{ run_id: "run_open", started_at: at(1), ended_at: null },
				{ run_id: "run_open", started_at: at(6), ended_at: null },
			])}`;
			const rows = await drizzle(client)
				.select({ id: runs.id, peak: peakWorkersSql })
				.from(runs)
				.orderBy(runs.id);
			expect(rows).toEqual([
				{ id: "run_none", peak: 0 },
				{ id: "run_open", peak: 2 },
				{ id: "run_waves", peak: 3 },
			]);
		} finally {
			await client.end();
			await admin.unsafe(`drop schema ${schemaName} cascade`);
			await admin.end();
		}
	},
);

const capturedSet = async (set: Partial<RunRow>) => {
	let written: Partial<RunRow> | undefined;
	const ctx = {
		db: {
			update: () => ({
				set: (value: Partial<RunRow>) => {
					written = value;
					return { where: async () => undefined };
				},
			}),
		},
	} as unknown as TwdContext;
	await updateRun({ ctx, runId: "run_1", set });
	return written;
};

test("cancelling or erroring a run on any path drops its baseline flag", async () => {
	expect(await capturedSet({ status: "cancelled" })).toEqual({
		status: "cancelled",
		isBaseline: false,
	});
	expect(await capturedSet({ status: "errored" })).toEqual({
		status: "errored",
		isBaseline: false,
	});
});

test("other writes leave the baseline flag alone", async () => {
	expect(await capturedSet({ status: "failed" })).toEqual({ status: "failed" });
	expect(await capturedSet({ status: "running" })).toEqual({
		status: "running",
	});
	expect(await capturedSet({ passed: 3 })).toEqual({ passed: 3 });
});
