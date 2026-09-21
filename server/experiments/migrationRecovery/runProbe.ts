import assert from "node:assert/strict";
import { TriggerClient } from "@trigger.dev/sdk";
import { Redis } from "ioredis";
import { experimentRedisUrl, getExperimentPool } from "./experimentDb.js";
import type { ProbeInput } from "./tasks/retryProbe.js";

const secretKey = process.env.TRIGGER_SERVER_SECRET_KEY;
if (!secretKey?.startsWith("tr_dev_"))
	throw new Error("Development API key required");
const trigger = new TriggerClient({
	secretKey,
	previewBranch: "zagreb-migration-recovery-experiment",
	baseURL: process.env.TRIGGER_API_URL,
});
const pool = getExperimentPool();
await pool.query(`
	CREATE SCHEMA IF NOT EXISTS recovery_probe;
	CREATE TABLE IF NOT EXISTS recovery_probe.customers (
		case_id text PRIMARY KEY, version integer NOT NULL DEFAULT 1
	);
	CREATE TABLE IF NOT EXISTS recovery_probe.attempts (
		id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
		case_id text NOT NULL, stage text NOT NULL, attempt integer NOT NULL,
		run_id text NOT NULL, result jsonb NOT NULL
	);
`);

const waitForRun = async ({ id }: { id: string }) => {
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		const run = await trigger.runs.retrieve(id);
		if (run.isCompleted) return run;
		await Bun.sleep(1_000);
	}
	await trigger.runs.cancel(id);
	throw new Error(`Experiment run exceeded deadline: ${id}`);
};

const modes = Bun.argv.slice(2) as (
	| ProbeInput["mode"]
	| "manual-replay"
	| "saved-crash"
	| "saved-error"
)[];
assert(modes.length > 0 && modes.length <= 3, "Run one to three named cases");
const redis = new Redis(experimentRedisUrl());
try {
	for (const mode of modes) {
		assert(
			[
				"parent-retry",
				"lost-result",
				"crash",
				"redis-retry",
				"child-failed",
				"manual-replay",
				"saved-crash",
				"saved-error",
			].includes(mode),
		);
		const caseId = `probe-${mode}-${crypto.randomUUID()}`;
		await pool.query(
			"INSERT INTO recovery_probe.customers(case_id) VALUES ($1)",
			[caseId],
		);
		await redis.set(`migration-recovery-probe:${caseId}`, "stale");
		const started = Date.now();
		const savedMode = mode === "saved-crash" || mode === "saved-error";
		const orgId = `org-${caseId}`;
		if (savedMode)
			await pool.query(
				'INSERT INTO organizations(id, slug, name, "createdAt") VALUES ($1, $1, $1, now())',
				[orgId],
			);
		const handle = await trigger.tasks.trigger(
			savedMode
				? "zagreb-recovery-saved-result-probe"
				: "zagreb-recovery-parent-probe",
			{ caseId, orgId, mode: mode === "manual-replay" ? "parent-retry" : mode },
		);
		let run = await waitForRun({ id: handle.id });
		if (mode === "manual-replay") {
			assert.equal(run.status, "COMPLETED");
			const replay = await trigger.runs.replay(handle.id);
			run = await waitForRun({ id: replay.id });
		}
		const attempts = (
			await pool.query(
				"SELECT stage, attempt, run_id, result FROM recovery_probe.attempts WHERE case_id = $1 ORDER BY id",
				[caseId],
			)
		).rows;
		const cache = await redis.get(`migration-recovery-probe:${caseId}`);
		console.log(
			JSON.stringify({
				mode,
				caseId,
				runId: run.id,
				status: run.status,
				output: run.output,
				elapsedMs: Date.now() - started,
				attempts,
				cache,
			}),
		);
		if (mode === "parent-retry") {
			assert.equal(run.status, "COMPLETED");
			assert.equal(attempts.filter((row) => row.stage === "sql").length, 1);
			assert.equal(attempts.filter((row) => row.stage === "parent").length, 2);
		}
		if (
			mode === "lost-result" ||
			mode === "crash" ||
			mode === "manual-replay"
		) {
			assert.equal(run.status, "COMPLETED");
			const sqlAttempts = attempts.filter((row) => row.stage === "sql");
			assert.equal(sqlAttempts.length, 2);
			assert.equal(sqlAttempts[0].result.length, 1);
			assert.deepEqual(sqlAttempts[1].result, []);
			assert.deepEqual(run.output, { changes: [] });
		}
		if (mode === "redis-retry") {
			assert.equal(run.status, "COMPLETED");
			assert.equal(attempts.filter((row) => row.stage === "sql").length, 1);
			assert.equal(attempts.filter((row) => row.stage === "cache").length, 2);
			assert.equal(cache, null);
		}
		if (mode === "child-failed") {
			assert.equal(run.status, "FAILED");
			const sqlAttempts = attempts.filter((row) => row.stage === "sql");
			assert.equal(sqlAttempts.length, 4);
			assert.equal(new Set(sqlAttempts.map((row) => row.run_id)).size, 2);
		}
		if (savedMode) {
			assert.equal(run.status, "COMPLETED");
			assert.deepEqual(run.output, {
				changes: [{ case_id: caseId, version: 2 }],
			});
			assert.equal(attempts.filter((row) => row.stage === "sql").length, 1);
			const returned = attempts.filter((row) => row.stage === "returned");
			assert.equal(returned.length, 2);
			assert.deepEqual(returned[0].result, returned[1].result);
			await pool.query("DELETE FROM organizations WHERE id = $1", [orgId]);
		}
		await redis.del(`migration-recovery-probe:${caseId}`);
	}
} finally {
	redis.disconnect();
	await pool.end();
}
