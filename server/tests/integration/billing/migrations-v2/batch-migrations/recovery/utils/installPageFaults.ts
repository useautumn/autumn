import { mock } from "bun:test";
import { sql } from "drizzle-orm";
import type { addCustomerEntitlementsForPage } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import type { queueMigrationWebhooks } from "@/internal/migrations/v2/webhookDelivery/utils/queueMigrationWebhooks.js";

/** Where a page dies, or loses its claims, while adding to one plan's customers. */
export type PageFault =
	| "before_add"
	| "after_add"
	| "release_claims_before_add";

/** Whether a customer's next webhook enqueue fails before or after it was sent. */
export type EnqueueFault = "before_send" | "after_send";

const queueModulePath =
	"@/internal/migrations/v2/webhookDelivery/utils/queueMigrationWebhooks.js";
const addModulePath =
	"@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";

/** Wraps the batch add op so a test can fail a page at a chosen point, keyed
 * by the migrated plan's id so concurrent tests in one file stay independent. */
export const installPageFaults = async () => {
	const realAdd = { ...(await import(addModulePath)) };
	const realQueue = { ...(await import(queueModulePath)) };
	const pageFaults = new Map<string, PageFault>();
	const enqueueFaults = new Map<string, EnqueueFault[]>();
	/** Customer id → webhook enqueues that actually reached Svix. */
	const enqueueSends = new Map<string, number>();

	mock.module(addModulePath, () => ({
		...realAdd,
		addCustomerEntitlementsForPage: async (
			args: Parameters<typeof addCustomerEntitlementsForPage>[0],
		) => {
			const fault = pageFaults.get(args.fromProduct.id);
			if (fault === "before_add")
				throw new Error("injected: page died before this add");
			if (fault === "release_claims_before_add")
				await args.db.execute(sql`
					UPDATE migration_item_runs SET status = 'failed'
					WHERE item_id = ANY(${sql.param(args.internalCustomerIds)}::text[])
						AND status = 'running'
				`);
			const result = await realAdd.addCustomerEntitlementsForPage(args);
			if (fault === "after_add")
				throw new Error("injected: page died after this add committed");
			return result;
		},
	}));

	mock.module(queueModulePath, () => ({
		...realQueue,
		queueMigrationWebhooks: async (
			args: Parameters<typeof queueMigrationWebhooks>[0],
		) => {
			const fault = args.records
				.map((record) => enqueueFaults.get(record.customerId))
				.find((faults) => faults && faults.length > 0)
				?.shift();
			if (fault === "before_send")
				throw new Error("injected: webhook enqueue failed before sending");
			const batches = await realQueue.queueMigrationWebhooks(args);
			for (const { customerId } of args.records)
				enqueueSends.set(customerId, (enqueueSends.get(customerId) ?? 0) + 1);
			if (fault === "after_send")
				throw new Error("injected: webhook enqueue failed after sending");
			return batches;
		},
	}));

	return {
		pageFaults,
		enqueueFaults,
		enqueueSends,
		restore: () => {
			mock.module(addModulePath, () => realAdd);
			mock.module(queueModulePath, () => realQueue);
		},
	};
};
