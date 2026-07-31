import {
	CreateCustomerExportParamsSchema,
	type DbCustomerExport,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { getCustomerExportTriggerOptions } from "@/trigger/exports/customerExportQueue.js";
import {
	customerExportTask,
	executeCustomerExport,
} from "@/trigger/exports/customerExportTask.js";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline.js";
import { CustomerExportService } from "../exports/CustomerExportService.js";
import { createCustomerExportRealtimeToken } from "../exports/customerExportRealtimeToken.js";
import { customerExportToResponse } from "../exports/customerExportToResponse.js";
import { createExportReclaimingStale } from "../exports/reclaimStaleCustomerExport.js";

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
			// Stored verbatim so the export walk matches the dashboard list exactly.
			snapshot: { search, filters },
			requestedByUserId: ctx.userId ?? ctx.user?.id,
		});

		if (!result.created) {
			throw new RecaseError({
				message:
					"A customer export is already running. Wait for it to finish before starting another.",
				code: ErrCode.CustomerExportInProgress,
				statusCode: 409,
			});
		}

		const customerExport: DbCustomerExport = result.customerExport;
		const payload = {
			exportId: customerExport.id,
			orgId: ctx.org.id,
			env: ctx.env,
		};
		// Inline runs have no trigger run to subscribe to; the client stays on polling.
		let triggerRunId: string | null = null;

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

			triggerRunId = handle.id;

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

		const publicAccessToken = triggerRunId
			? await createCustomerExportRealtimeToken({
					triggerRunId,
					logger: ctx.logger,
				})
			: null;

		return c.json({
			export: customerExportToResponse({
				customerExport,
				triggerRunId,
				publicAccessToken,
			}),
		});
	},
});
