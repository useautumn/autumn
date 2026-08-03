import type { TinybirdMigrationItemEvent } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemEventRepo } from "@/internal/migrations/v2/repos/index.js";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { buildBatchMigrationItemResponses } from "./buildBatchMigrationItemResponses.js";

const SKIP_REASON = "no_batch_changes";

/**
 * One audit event per claimed customer, ingested as a single batch per page.
 * Replaying a page after a crash re-emits its events — at-least-once, same as
 * the per-customer lane's per-item emission.
 */
export const emitBatchMigrationItemEvents = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	pageResult,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	pageResult: BatchMigrationPageResult;
}): Promise<{ eventCount: number }> => {
	const responses = buildBatchMigrationItemResponses({
		plan,
		customers: pageResult.succeeded,
		insertedItems: pageResult.insertedItems,
		features: ctx.features,
	});

	const toEvent = ({
		customer,
		status,
		response,
	}: {
		customer: BatchMigrationPageCustomer;
		status: "succeeded" | "skipped";
		response: Record<string, unknown>;
	}): TinybirdMigrationItemEvent => ({
		timestamp: new Date().toISOString(),
		org_id: ctx.org.id,
		env: ctx.env,
		migration_internal_id: migrationInternalId,
		migration_run_id: migrationRunId,
		dry_run: false,
		item_kind: "customer",
		item_id: customer.internalId,
		item_preview: {
			id: customer.id,
			name: customer.name,
			email: customer.email,
		},
		status,
		response,
	});

	const events: TinybirdMigrationItemEvent[] = [
		...pageResult.succeeded.map((customer) =>
			toEvent({
				customer,
				status: "succeeded",
				response: {
					lane: "batch",
					preview: responses.get(customer.internalId) ?? null,
					line_items: [],
				},
			}),
		),
		...pageResult.skipped.map((customer) =>
			toEvent({
				customer,
				status: "skipped",
				response: { lane: "batch", reason: SKIP_REASON },
			}),
		),
	];

	await migrationItemEventRepo.insertMany({ ctx, events });
	return { eventCount: events.length };
};
