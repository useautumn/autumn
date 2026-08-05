import {
	type AppEnv,
	type CustomerExportField,
	type CustomerExportSnapshot,
	type DbCustomerExport,
	ms,
} from "@autumn/shared";
import { NotFoundError, runs } from "@trigger.dev/sdk/v3";
import { isBefore, subMilliseconds } from "date-fns";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getCustomerExportsS3Config } from "@/external/aws/s3/customerExportsS3Config.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { CUSTOMER_EXPORT_MAX_DURATION_SECONDS } from "@/trigger/exports/customerExportQueue.js";
import {
	type CreateCustomerExportResult,
	CustomerExportService,
} from "./CustomerExportService.js";
import { findPublishedExportObject } from "./findPublishedExportObject.js";

// Runless inline exports are considered abandoned after the configured task
// duration plus a one-hour margin.
const STALE_ACTIVE_EXPORT_AFTER_MS =
	ms.seconds(CUSTOMER_EXPORT_MAX_DURATION_SECONDS) + ms.hours(1);

const isStaleActiveExport = ({
	activeExport,
}: {
	activeExport: DbCustomerExport;
}) => {
	const lastProgressAt = activeExport.started_at ?? activeExport.created_at;
	return isBefore(
		lastProgressAt,
		subMilliseconds(Date.now(), STALE_ACTIVE_EXPORT_AFTER_MS),
	);
};

/** Unreachable run state means "maybe alive", so reclaim is skipped. */
const isTriggerRunDead = async ({
	triggerRunId,
	logger,
}: {
	triggerRunId: string;
	logger: Logger;
}): Promise<boolean> => {
	try {
		const run = await runs.retrieve(triggerRunId);
		return run.isCompleted;
	} catch (error) {
		if (error instanceof NotFoundError) return true;
		logger.warn(
			"customer-export: could not check trigger run state; skipping reclaim",
			{
				data: {
					triggerRunId,
					error: error instanceof Error ? error.message : String(error),
				},
			},
		);
		return false;
	}
};

/** A run id makes the run state authoritative; age only decides for runless rows. */
const isAbandonedExport = async ({
	activeExport,
	logger,
}: {
	activeExport: DbCustomerExport;
	logger: Logger;
}): Promise<boolean> => {
	if (activeExport.trigger_run_id) {
		return await isTriggerRunDead({
			triggerRunId: activeExport.trigger_run_id,
			logger,
		});
	}
	return isStaleActiveExport({ activeExport });
};

const resolveAbandonedExport = async ({
	db,
	logger,
	activeExport,
}: {
	db: DrizzleCli;
	logger: Logger;
	activeExport: DbCustomerExport;
}): Promise<boolean> => {
	const { bucket, region } = getCustomerExportsS3Config();
	const published = await findPublishedExportObject({
		logger,
		customerExport: activeExport,
		bucket,
		region,
	});

	// Unknown S3 state: failing the row now could discard a finished file.
	if (published.status === "unknown") return false;

	if (published.status === "published") {
		const promoted = await CustomerExportService.markCompleted({
			db,
			id: activeExport.id,
			rowCount: null,
			byteCount: published.byteCount,
		});
		if (promoted) {
			logger.warn(
				"customer-export: promoted abandoned export with a published file",
				{ data: { exportId: activeExport.id } },
			);
		}
		return promoted;
	}

	return await CustomerExportService.failIfStillActive({
		db,
		id: activeExport.id,
		errorMessage: "Export was interrupted",
		observed: {
			status: activeExport.status,
			startedAt: activeExport.started_at,
		},
	});
};

export const createExportReclaimingStale = async ({
	db,
	logger,
	orgId,
	env,
	fields,
	snapshot,
	requestedByUserId,
}: {
	db: DrizzleCli;
	logger: Logger;
	orgId: string;
	env: AppEnv;
	fields: CustomerExportField[];
	snapshot: CustomerExportSnapshot;
	requestedByUserId?: string;
}): Promise<CreateCustomerExportResult> => {
	const createParams = { db, orgId, env, fields, snapshot, requestedByUserId };

	const first = await CustomerExportService.createIfNoneActive(createParams);
	if (first.created || !first.activeExport) return first;

	const { activeExport } = first;
	if (!(await isAbandonedExport({ activeExport, logger }))) return first;

	const resolved = await resolveAbandonedExport({ db, logger, activeExport });
	if (!resolved) return first;

	logger.warn("customer-export: reclaimed abandoned active export", {
		data: { staleExportId: activeExport.id },
	});
	return await CustomerExportService.createIfNoneActive(createParams);
};
