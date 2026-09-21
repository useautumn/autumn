import { task } from "@trigger.dev/sdk";
import { Redis } from "ioredis";
import { createRedisFaultProxy } from "../../../tests/integration/billing/migrations-v2/utils/createRedisFaultProxy.js";
import { experimentRedisUrl, getExperimentPool } from "../experimentDb.js";

export type ProbeInput = {
	caseId: string;
	mode:
		| "parent-retry"
		| "lost-result"
		| "crash"
		| "redis-retry"
		| "child-failed";
};

const retry = { maxAttempts: 2, minTimeoutInMs: 500, maxTimeoutInMs: 500 };

export const mutationProbe = task({
	id: "zagreb-recovery-mutation-probe",
	retry,
	run: async (input: ProbeInput, { ctx }) => {
		if (ctx.environment.type !== "DEVELOPMENT")
			throw new Error("Development only");
		const client = await getExperimentPool().connect();
		let changes: { case_id: string; version: number }[];
		try {
			await client.query("BEGIN");
			const result = await client.query(
				"UPDATE recovery_probe.customers SET version = 2 WHERE case_id = $1 AND version = 1 RETURNING case_id, version",
				[input.caseId],
			);
			changes = result.rows;
			await client.query(
				"INSERT INTO recovery_probe.attempts (case_id, stage, attempt, run_id, result) VALUES ($1, 'sql', $2, $3, $4)",
				[input.caseId, ctx.attempt.number, ctx.run.id, JSON.stringify(changes)],
			);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
		if (ctx.attempt.number === 1 && input.mode === "lost-result")
			throw new Error("Injected after SQL commit, before task result");
		if (ctx.attempt.number === 1 && input.mode === "crash") process.exit(17);
		if (input.mode === "child-failed")
			throw new Error("Injected terminal child failure");
		return { changes };
	},
});

export const cacheProbe = task({
	id: "zagreb-recovery-cache-probe",
	retry,
	run: async (input: ProbeInput, { ctx }) => {
		if (ctx.environment.type !== "DEVELOPMENT")
			throw new Error("Development only");
		await getExperimentPool().query(
			"INSERT INTO recovery_probe.attempts (case_id, stage, attempt, run_id, result) VALUES ($1, 'cache', $2, $3, $4)",
			[input.caseId, ctx.attempt.number, ctx.run.id, JSON.stringify(input)],
		);
		const redis = new Redis(experimentRedisUrl());
		const fault = await createRedisFaultProxy({ redis });
		try {
			if (ctx.attempt.number === 1) fault.block();
			await fault.client.del(`migration-recovery-probe:${input.caseId}`);
		} finally {
			await fault.close();
			redis.disconnect();
		}
		return { cleared: input.caseId };
	},
});

export const parentProbe = task({
	id: "zagreb-recovery-parent-probe",
	retry,
	run: async (input: ProbeInput, { ctx }) => {
		if (ctx.environment.type !== "DEVELOPMENT")
			throw new Error("Development only");
		const result = await mutationProbe
			.triggerAndWait(input, {
				idempotencyKey: `mutation:${input.caseId}`,
				idempotencyKeyTTL: "7d",
			})
			.unwrap();
		await getExperimentPool().query(
			"INSERT INTO recovery_probe.attempts (case_id, stage, attempt, run_id, result) VALUES ($1, 'parent', $2, $3, $4)",
			[input.caseId, ctx.attempt.number, ctx.run.id, JSON.stringify(result)],
		);
		if (input.mode === "parent-retry" && ctx.attempt.number === 1)
			throw new Error("Injected after completed child");
		if (input.mode === "redis-retry")
			await cacheProbe
				.triggerAndWait(input, {
					idempotencyKey: `cache:${input.caseId}`,
				})
				.unwrap();
		return result;
	},
});
