import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../db/schema/schema.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { updateFileProfiles } from "../actions/updateFileProfiles.ts";
import { listFileProfiles } from "./fileProfiles.ts";
import { insertFileRunStats, summariseRunResources } from "./fileRunStats.ts";

const testDatabaseUrl = process.env.TWD_TEST_DATABASE_URL;
const MIGRATION = join(
	import.meta.dir,
	"../../../db/migrations/0010_file_profiles.sql",
);

const stats = ({
	wallMs,
	requests,
}: {
	wallMs: number;
	requests: number;
}): FileStats => ({
	v: 1,
	wallMs,
	exitCode: 0,
	concurrentMax: 1,
	stripe: {
		requests,
		testRequests: requests,
		serverRequests: 0,
		apportionedRequests: 0,
		peakRps: 3,
		meanRps: requests / (wallMs / 1000),
		peakInFlight: 2,
		meanInFlight: 0.5,
		rateLimited: 1,
		rateLimitedReasons: { "global-rate": 1 },
		permitWaitMs: 40,
		permitWaitMaxMs: 30,
		permitWaitP95Ms: 10,
		machinePeakRps: 4,
		machinePeakInFlight: 3,
		machineRateLimited: 1,
	},
	cpu: { coreSeconds: 5, peakCores: 1.5, testProcessSeconds: 2 },
	mem: { peakMib: 1_800, testProcessPeakMib: 250 },
});

test.skipIf(!testDatabaseUrl)(
	"a finished run's stats fold into file_profiles once, and get_run totals them",
	async () => {
		const schemaName = `twd_profiles_${crypto.randomUUID().replaceAll("-", "")}`;
		const admin = postgres(testDatabaseUrl as string, {
			max: 1,
			onnotice: () => {},
		});
		await admin.unsafe(`create schema ${schemaName}`);
		const client = postgres(testDatabaseUrl as string, {
			max: 1,
			onnotice: () => {},
			connection: { search_path: schemaName },
		});
		try {
			await client.unsafe(`
				create table runs (id text primary key, status text not null, selection jsonb not null);
				create table test_results (run_id text not null, file text not null, repetition integer, status text not null, attempt integer not null, duration_ms integer not null);
				${readFileSync(MIGRATION, "utf8").replaceAll("--> statement-breakpoint", "")}
			`);
			const ctx = {
				db: drizzle(client, { schema }),
				logger: { info: () => {}, warn: () => {} },
			} as unknown as TwdContext;
			await client`insert into runs ${client([
				{
					id: "run_a",
					status: "passed",
					selection: JSON.stringify({ groups: ["core"] }),
				},
				{
					id: "run_grep",
					status: "passed",
					selection: JSON.stringify({ grep: "x" }),
				},
			])}`;
			await client`insert into test_results ${client([
				{
					run_id: "run_a",
					file: "a.test.ts",
					repetition: null,
					status: "passed",
					attempt: 1,
					duration_ms: 10_000,
				},
				{
					run_id: "run_a",
					file: "b.test.ts",
					repetition: null,
					status: "passed",
					attempt: 1,
					duration_ms: 7_000,
				},
			])}`;
			await insertFileRunStats({
				ctx,
				runId: "run_a",
				file: "a.test.ts",
				attempt: 1,
				worker: "w1",
				workerClass: "2c4g-us-east-1",
				stats: stats({ wallMs: 10_000, requests: 50 }),
			});

			expect(await updateFileProfiles({ ctx, runId: "run_a" })).toEqual({
				files: 2,
			});
			expect(await updateFileProfiles({ ctx, runId: "run_a" })).toEqual({
				files: 0,
			});
			expect(await updateFileProfiles({ ctx, runId: "run_grep" })).toEqual({
				files: 0,
			});
			const profiles = await listFileProfiles({
				ctx,
				workerClass: "2c4g-us-east-1",
			});
			expect(
				profiles
					.map(({ file, samples, durationMeanMs, stripeRequests }) => ({
						file,
						samples,
						durationMeanMs,
						stripeRequests,
					}))
					.sort((a, b) => a.file.localeCompare(b.file)),
			).toEqual([
				{
					file: "a.test.ts",
					samples: 1,
					durationMeanMs: 10_000,
					stripeRequests: 50,
				},
				{
					file: "b.test.ts",
					samples: 1,
					durationMeanMs: 7_000,
					stripeRequests: null,
				},
			]);

			expect(await summariseRunResources({ ctx, runId: "run_a" })).toEqual({
				attempts: 1,
				stripeRequests: 50,
				rateLimited: 1,
				permitWaitP95Ms: 10,
				permitWaitMaxMs: 30,
				workerPeakRps: 4,
				workerPeakInFlight: 3,
				cpuCoreSeconds: 5,
				cpuPeakCoresP95: 1.5,
				memPeakMibP95: 1_800,
				memPeakMibMax: 1_800,
			});
			expect(await summariseRunResources({ ctx, runId: "run_grep" })).toBe(
				null,
			);
		} finally {
			await client.end();
			await admin.unsafe(`drop schema ${schemaName} cascade`);
			await admin.end();
		}
	},
);
