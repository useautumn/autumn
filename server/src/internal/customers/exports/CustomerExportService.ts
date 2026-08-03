import {
	ACTIVE_CUSTOMER_EXPORT_STATUSES,
	type AppEnv,
	type CustomerExportField,
	type CustomerExportSnapshot,
	CustomerExportStatus,
	customerExports,
	type DbCustomerExport,
} from "@autumn/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

const orgEnvScope = ({ orgId, env }: { orgId: string; env: AppEnv }) =>
	and(eq(customerExports.org_id, orgId), eq(customerExports.env, env));

export type CreateCustomerExportResult =
	| { created: true; customerExport: DbCustomerExport }
	| { created: false; activeExport: DbCustomerExport | null };

export const CustomerExportService = {
	/** Returns `created: false` when the partial unique index rejects a second active export. */
	create: async ({
		db,
		orgId,
		env,
		fields,
		snapshot,
		requestedByUserId,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		fields: CustomerExportField[];
		snapshot: CustomerExportSnapshot;
		requestedByUserId?: string;
	}): Promise<CreateCustomerExportResult> => {
		const row = {
			id: generateId("cusexp"),
			org_id: orgId,
			env,
			status: CustomerExportStatus.Queued,
			fields,
			snapshot,
			requested_by_user_id: requestedByUserId ?? null,
			created_at: Date.now(),
		};

		try {
			const inserted = await db.insert(customerExports).values(row).returning();
			return { created: true, customerExport: inserted[0] };
		} catch (error) {
			if (!isUniqueConstraintError(error)) throw error;

			const activeExport = await CustomerExportService.findActive({
				db,
				orgId,
				env,
			});
			return { created: false, activeExport };
		}
	},

	findActive: async ({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}): Promise<DbCustomerExport | null> => {
		const rows = await db
			.select()
			.from(customerExports)
			.where(
				and(
					orgEnvScope({ orgId, env }),
					inArray(customerExports.status, [...ACTIVE_CUSTOMER_EXPORT_STATUSES]),
				),
			)
			.limit(1);

		return rows[0] ?? null;
	},

	get: async ({
		db,
		id,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		id: string;
		orgId: string;
		env: AppEnv;
	}): Promise<DbCustomerExport | null> => {
		const rows = await db
			.select()
			.from(customerExports)
			.where(and(eq(customerExports.id, id), orgEnvScope({ orgId, env })))
			.limit(1);

		return rows[0] ?? null;
	},

	list: async ({
		db,
		orgId,
		env,
		limit,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		limit: number;
	}): Promise<DbCustomerExport[]> =>
		await db
			.select()
			.from(customerExports)
			.where(orgEnvScope({ orgId, env }))
			.orderBy(desc(customerExports.created_at))
			.limit(limit),

	setTriggerRunId: async ({
		db,
		id,
		triggerRunId,
	}: {
		db: DrizzleCli;
		id: string;
		triggerRunId: string;
	}) => {
		await db
			.update(customerExports)
			.set({ trigger_run_id: triggerRunId })
			.where(eq(customerExports.id, id));
	},

	markRunning: async ({
		db,
		id,
		s3Key,
	}: {
		db: DrizzleCli;
		id: string;
		s3Key: string;
	}) => {
		await db
			.update(customerExports)
			.set({
				status: CustomerExportStatus.Running,
				s3_key: s3Key,
				s3_upload_id: null,
				started_at: Date.now(),
			})
			.where(eq(customerExports.id, id));
	},

	/**
	 * Guarded to active rows so a reclaimed (failed) export is never resurrected;
	 * returns whether the row was actually completed.
	 */
	markCompleted: async ({
		db,
		id,
		rowCount,
		byteCount,
	}: {
		db: DrizzleCli;
		id: string;
		rowCount: number | null;
		byteCount: number | null;
	}): Promise<boolean> => {
		const updated = await db
			.update(customerExports)
			.set({
				status: CustomerExportStatus.Completed,
				row_count: rowCount,
				byte_count: byteCount,
				completed_at: Date.now(),
			})
			.where(
				and(
					eq(customerExports.id, id),
					inArray(customerExports.status, [...ACTIVE_CUSTOMER_EXPORT_STATUSES]),
				),
			)
			.returning({ id: customerExports.id });

		return updated.length > 0;
	},

	/**
	 * Compare-and-swap reclaim: fails the export only while it still matches the
	 * observed lifecycle state, so a run that just progressed is left alone.
	 */
	failIfStillActive: async ({
		db,
		id,
		errorMessage,
		observed,
	}: {
		db: DrizzleCli;
		id: string;
		errorMessage: string;
		observed: { status: CustomerExportStatus; startedAt: number | null };
	}): Promise<boolean> => {
		const updated = await db
			.update(customerExports)
			.set({
				status: CustomerExportStatus.Failed,
				error_message: errorMessage,
				completed_at: Date.now(),
			})
			.where(
				and(
					eq(customerExports.id, id),
					eq(customerExports.status, observed.status),
					observed.startedAt === null
						? isNull(customerExports.started_at)
						: eq(customerExports.started_at, observed.startedAt),
				),
			)
			.returning({ id: customerExports.id });

		return updated.length > 0;
	},

	markFailed: async ({
		db,
		id,
		errorMessage,
	}: {
		db: DrizzleCli;
		id: string;
		errorMessage: string;
	}) => {
		await db
			.update(customerExports)
			.set({
				status: CustomerExportStatus.Failed,
				error_message: errorMessage,
				completed_at: Date.now(),
			})
			.where(eq(customerExports.id, id));
	},
};
