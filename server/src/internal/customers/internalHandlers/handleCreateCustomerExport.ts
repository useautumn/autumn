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
import { customerExportToResponse } from "../exports/customerExportToResponse.js";

export const handleCreateCustomerExport = createRoute({
	scopes: [Scopes.Customers.Read],
	body: CreateCustomerExportParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { fields, search, filters } = c.req.valid("json");

		const result = await CustomerExportService.create({
			db: ctx.db,
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
			try {
				const handle = await customerExportTask.trigger(payload, {
					idempotencyKey: `customer-export:${customerExport.id}`,
					idempotencyKeyTTL: "7d",
					...getCustomerExportTriggerOptions({
						isDev: process.env.NODE_ENV === "development",
					}),
				});
				await CustomerExportService.setTriggerRunId({
					db: ctx.db,
					id: customerExport.id,
					triggerRunId: handle.id,
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
		}

		return c.json({ export: customerExportToResponse({ customerExport }) });
	},
});
