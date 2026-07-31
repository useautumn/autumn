import {
	type AppEnv,
	CreateCustomerExportParamsSchema,
	type CustomerExportField,
	type CustomerExportSnapshot,
	type DbCustomerExport,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { runs } from "@trigger.dev/sdk/v3";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import {
	CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	getCustomerExportTriggerOptions,
} from "@/trigger/exports/customerExportQueue.js";
import {
	customerExportTask,
	executeCustomerExport,
} from "@/trigger/exports/customerExportTask.js";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline.js";
import { CustomerExportService } from "../exports/CustomerExportService.js";
import { customerExportToResponse } from "../exports/customerExportToResponse.js";

const HOUR_MS = 60 * 60 * 1000;
// Age is only a precondition for reclaim: when a trigger run id exists, the run
// state decides, so a run stuck behind queue backlog is never discarded.
const STALE_ACTIVE_EXPORT_AFTER_MS =
	CUSTOMER_EXPORT_MAX_DURATION_SECONDS * 1000 + HOUR_MS;

const isStaleActiveExport = ({
	activeExport,
}: {
	activeExport: DbCustomerExport;
}) => {
	const lastProgressAt = activeExport.started_at ?? activeExport.created_at;
	return Date.now() - lastProgressAt > STALE_ACTIVE_EXPORT_AFTER_MS;
};

const isNotFoundApiError = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"status" in error &&
	(error as { status: unknown }).status === 404;

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
		if (isNotFoundApiError(error)) return true;
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

/** A dead run must not block the org forever, so a stale active export is failed and retried once. */
const createExportReclaimingStale = async ({
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
}) => {
	const createParams = {
		db,
		orgId,
		env,
		fields,
		snapshot,
		requestedByUserId,
	};

	const first = await CustomerExportService.create(createParams);
	if (first.created || !first.activeExport) return first;

	const { activeExport } = first;
	if (!isStaleActiveExport({ activeExport })) return first;

	// No run id means the run was inline or never persisted — age is all we have.
	const runIsDead = activeExport.trigger_run_id
		? await isTriggerRunDead({
				triggerRunId: activeExport.trigger_run_id,
				logger,
			})
		: true;
	if (!runIsDead) return first;

	const reclaimed = await CustomerExportService.failIfStillActive({
		db,
		id: activeExport.id,
		errorMessage: "Export timed out",
		observed: {
			status: activeExport.status,
			startedAt: activeExport.started_at,
		},
	});
	if (!reclaimed) return first;

	logger.warn("customer-export: reclaimed stale active export", {
		data: { staleExportId: activeExport.id },
	});
	return await CustomerExportService.create(createParams);
};

export const handleCreateCustomerExport = createRoute({
	scopes: [Scopes.Customers.Read],
	body: CreateCustomerExportParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { fields, search, filters } = c.req.valid("json");

		const result = await createExportReclaimingStale({
			db: ctx.db,
			logger: ctx.logger,
			orgId: ctx.org.id,
			env: ctx.env,
			fields,
			snapshot: { search: search.trim(), filters },
			requestedByUserId: ctx.userId ?? ctx.user?.id,
		});

		if (!result.created) {
			throw new RecaseError({
				message:
					"A customer export is already running. Wait for it to finish before starting another.",
				code: ErrCode.CustomerExportInProgress,
				statusCode: 409,
				data: { active_export_id: result.activeExport?.id ?? null },
			});
		}

		const customerExport: DbCustomerExport = result.customerExport;
		const payload = {
			exportId: customerExport.id,
			orgId: ctx.org.id,
			env: ctx.env,
		};

		if (shouldRunTriggerTasksInline()) {
			ctx.logger.warn(
				"customer-export: trigger.dev not configured — running export inline",
				{ data: { exportId: customerExport.id } },
			);
			const inlineCtx = { ...ctx, insideTriggerTask: true };
			void executeCustomerExport({
				ctx: inlineCtx,
				logger: ctx.logger,
				payload,
			}).catch((error) => {
				ctx.logger.error("customer-export: inline execution failed", {
					data: {
						exportId: customerExport.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
		} else {
			let handle: Awaited<ReturnType<typeof customerExportTask.trigger>>;
			try {
				handle = await customerExportTask.trigger(payload, {
					idempotencyKey: `customer-export:${customerExport.id}`,
					idempotencyKeyTTL: "7d",
					...getCustomerExportTriggerOptions({
						isDev: process.env.NODE_ENV === "development",
					}),
				});
			} catch (error) {
				// A queued row nobody will ever pick up would block the org forever.
				await CustomerExportService.markFailed({
					db: ctx.db,
					id: customerExport.id,
					errorMessage: "Failed to enqueue the export job",
				});
				throw error;
			}

			// Best-effort: the job is already enqueued, so this must never fail the export.
			try {
				await CustomerExportService.setTriggerRunId({
					db: ctx.db,
					id: customerExport.id,
					triggerRunId: handle.id,
				});
			} catch (error) {
				ctx.logger.error("customer-export: failed to persist trigger run id", {
					data: {
						exportId: customerExport.id,
						triggerRunId: handle.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		}

		return c.json({ export: customerExportToResponse({ customerExport }) });
	},
});
