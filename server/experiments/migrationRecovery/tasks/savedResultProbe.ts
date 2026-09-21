import { task } from "@trigger.dev/sdk";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { integer, pgSchema, text } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "../../../src/db/initDrizzle.js";
import { withMigrationBatchResult } from "../../../src/internal/migrations/v2/repos/migrationBatchResult/withMigrationBatchResult.js";
import { getExperimentPool } from "../experimentDb.js";

const customers = pgSchema("recovery_probe").table("customers", {
	case_id: text().primaryKey(),
	version: integer().notNull(),
});

export const savedResultProbe = task({
	id: "zagreb-recovery-saved-result-probe",
	retry: { maxAttempts: 2, minTimeoutInMs: 500, maxTimeoutInMs: 500 },
	run: async (
		input: {
			caseId: string;
			orgId: string;
			mode: "saved-crash" | "saved-error";
		},
		{ ctx },
	) => {
		if (ctx.environment.type !== "DEVELOPMENT")
			throw new Error("Development only");
		const pool = getExperimentPool();
		const db = drizzle(pool) as unknown as DrizzleCli;
		const result = await withMigrationBatchResult({
			ctx: { db },
			recovery: {
			orgId: input.orgId,
			env: "sandbox",
			batchId: input.caseId,
			input: { version: 1, customerIds: [input.caseId], targetVersion: 2 },
			},
			execute: async ({ ctx: transaction }) => {
				const changes = await transaction.db
					.update(customers)
					.set({ version: 2 })
					.where(and(eq(customers.case_id, input.caseId), eq(customers.version, 1)))
					.returning();
				await transaction.db.execute(sql`INSERT INTO recovery_probe.attempts (case_id, stage, attempt, run_id, result)
					VALUES (${input.caseId}, 'sql', ${ctx.attempt.number}, ${ctx.run.id}, ${JSON.stringify(changes)}::jsonb)`);
				return { changes };
			},
		});
		await pool.query(
			"INSERT INTO recovery_probe.attempts (case_id, stage, attempt, run_id, result) VALUES ($1, 'returned', $2, $3, $4)",
			[input.caseId, ctx.attempt.number, ctx.run.id, JSON.stringify(result)],
		);
		if (ctx.attempt.number === 1) {
			if (input.mode === "saved-crash") process.exit(17);
			throw new Error("Injected after committed batch result");
		}
		return result;
	},
});
