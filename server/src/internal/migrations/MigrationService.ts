import {
	type AppEnv,
	ErrCode,
	type MigrationJob,
	MigrationJobStep,
	migrationErrors,
	migrationJobs,
} from "@autumn/shared";
import { and, eq, ne } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";

export class MigrationService {
	static async createJob({ db, data }: { db: DrizzleCli; data: MigrationJob }) {
		const result = await db.insert(migrationJobs).values(data).returning();

		if (result.length === 0) {
			throw new RecaseError({
				message: "Failed to create migration job",
				code: ErrCode.InsertMigrationJobFailed,
			});
		}

		return result[0];
	}

	static async updateJob({
		db,
		migrationJobId,
		updates,
	}: {
		db: DrizzleCli;
		migrationJobId: string;
		updates: any;
	}) {
		const results = await db
			.update(migrationJobs)
			.set({
				...updates,
				updated_at: Date.now(),
			})
			.where(eq(migrationJobs.id, migrationJobId))
			.returning();

		if (results.length === 0) {
			return null;
		}

		return results[0];
	}

	static async getJob({ db, id }: { db: DrizzleCli; id: string }) {
		const job = await db.query.migrationJobs.findFirst({
			where: eq(migrationJobs.id, id),
		});

		if (!job) {
			throw new RecaseError({
				message: `Migration job ${id} not found`,
				code: ErrCode.MigrationJobNotFound,
			});
		}

		return job as MigrationJob;
	}

	static async getExistingJobs({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		const jobs = await db.query.migrationJobs.findMany({
			where: and(
				eq(migrationJobs.org_id, orgId),
				eq(migrationJobs.env, env),
				ne(migrationJobs.current_step, MigrationJobStep.Failed),
				ne(migrationJobs.current_step, MigrationJobStep.Finished),
			),
		});

		return jobs as MigrationJob[];
	}

	static async insertError({ db, data }: { db: DrizzleCli; data: any }) {
		const result = await db.insert(migrationErrors).values(data).returning();

		if (result.length === 0) {
			throw new RecaseError({
				message: "Failed to insert migration error",
				code: ErrCode.InsertMigrationErrorFailed,
			});
		}

		return result[0];
	}

	static async getErrors({
		db,
		migrationJobId,
	}: {
		db: DrizzleCli;
		migrationJobId: string;
	}) {
		const errors = await db.query.migrationErrors.findMany({
			where: eq(migrationErrors.migration_job_id, migrationJobId),
			with: {
				customer: true,
			},
		});

		return errors;
	}
}
