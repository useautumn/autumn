import { mock } from "bun:test";
import { sql } from "drizzle-orm";
import type { addCustomerEntitlementsForPage } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";

/** Where a page dies, or loses its claims, while adding to one plan's customers. */
export type PageFault =
	| "before_add"
	| "after_add"
	| "release_claims_before_add";

const addModulePath =
	"@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";

/** Wraps the batch add op so a test can fail a page at a chosen point, keyed
 * by the migrated plan's id so concurrent tests in one file stay independent. */
export const installPageFaults = async () => {
	const realAdd = { ...(await import(addModulePath)) };
	const pageFaults = new Map<string, PageFault>();

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

	return {
		pageFaults,
		restore: () => mock.module(addModulePath, () => realAdd),
	};
};
