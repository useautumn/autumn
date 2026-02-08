import {
	type AppEnv,
	ErrCode,
	type FullProduct,
	type MigrationJob,
	MigrationJobStep,
	migrationErrors,
	migrationJobs,
} from "@autumn/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";

/** Generate a stable numeric hash from a string for use with pg_advisory_lock. */
function stringToLockId(str: string): number {
	return Number(BigInt(Bun.hash(str)) & BigInt(0x7fffffff));
}

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

	/**
	 * Atomically check for existing migration and create a new one if none exists.
	 * Uses PostgreSQL advisory lock to prevent race conditions between concurrent requests.
	 */
	static async createJobIfNoExisting({
		db,
		orgId,
		env,
		fromProduct,
		data,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		fromProduct: FullProduct;
		data: MigrationJob;
	}) {
		// Create a unique lock key based on org, env, and product
		const lockKey = `migration:${orgId}:${env}:${fromProduct.internal_id}`;
		const lockId = stringToLockId(lockKey);

		return await db.transaction(async (tx) => {
			const txDb = tx as unknown as DrizzleCli;

			// Try to acquire advisory lock - returns false immediately if lock is held
			// This prevents connection pool exhaustion from concurrent requests
			const lockResult = await txDb.execute<{ acquired: boolean }>(
				sql`SELECT pg_try_advisory_xact_lock(${lockId}) as acquired`,
			);
			const lockAcquired = lockResult[0]?.acquired;

			if (!lockAcquired) {
				throw new RecaseError({
					message: `Another migration is ongoing for customers on the ${fromProduct.name} product, please try again`,
					code: ErrCode.MigrationAlreadyInProgress,
					statusCode: 409,
				});
			}

			// Now check for existing in-progress migrations (safe since we hold the lock)
			const existingJobs = await txDb.query.migrationJobs.findMany({
				where: and(
					eq(migrationJobs.org_id, orgId),
					eq(migrationJobs.env, env),
					eq(migrationJobs.from_internal_product_id, fromProduct.internal_id),
					ne(migrationJobs.current_step, MigrationJobStep.Failed),
					ne(migrationJobs.current_step, MigrationJobStep.Finished),
				),
			});

			if (existingJobs.length > 0) {
				throw new RecaseError({
					message: `Another migration is ongoing for customers on the ${fromProduct.name} product, cannot create a new migration`,
					code: ErrCode.MigrationAlreadyInProgress,
					statusCode: 409,
				});
			}

			// Insert the new job
			const result = await txDb.insert(migrationJobs).values(data).returning();

			if (result.length === 0) {
				throw new RecaseError({
					message: "Failed to create migration job",
					code: ErrCode.InsertMigrationJobFailed,
				});
			}

			return result[0];
		});
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
