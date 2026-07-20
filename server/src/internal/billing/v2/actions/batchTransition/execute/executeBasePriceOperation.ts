import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import type { BasePriceOperation } from "../types/basePriceOperationTypes";
import type { CustomerEntitlementBatchTransition } from "../types/types";
import { executeBatchedMutation } from "./executeBatchedMutation";
import { addCustomerBasePricesBatch } from "./sql/addCustomerBasePricesBatch";
import { deleteCustomerBasePricesBatch } from "./sql/deleteCustomerBasePricesBatch";
import { replaceCustomerBasePricesBatch } from "./sql/replaceCustomerBasePricesBatch";

export type BasePriceOperationResult = {
	replaced: number;
	added: number;
	removed: number;
};

export const executeBasePriceOperation = async ({
	ctx,
	batchTransition,
	operation,
}: {
	ctx: AutumnContext;
	batchTransition: CustomerEntitlementBatchTransition;
	operation: BasePriceOperation | undefined;
}): Promise<BasePriceOperationResult> => {
	if (!operation) return { replaced: 0, added: 0, removed: 0 };

	if (operation.type === "replace") {
		if (operation.fromPriceIds.length === 0) {
			return { replaced: 0, added: 0, removed: 0 };
		}
		if (operation.fromPriceIds.includes(operation.toPrice.id)) {
			throw new Error(
				"Base price replacement requires different outgoing and incoming price IDs",
			);
		}
		const replaced = await executeBatchedMutation({
			db: ctx.db,
			operationName: "Customer base price replacement",
			executeBatch: ({ db, batchSize }) =>
				replaceCustomerBasePricesBatch({
					db,
					customerLicenseLinkId: batchTransition.customerLicenseLinkId,
					operation,
					batchSize,
				}),
		});
		return { replaced, added: 0, removed: 0 };
	}

	if (operation.type === "remove") {
		if (operation.fromPriceIds.length === 0) {
			return { replaced: 0, added: 0, removed: 0 };
		}
		const removed = await executeBatchedMutation({
			db: ctx.db,
			operationName: "Customer base price deletion",
			executeBatch: ({ db, batchSize }) =>
				deleteCustomerBasePricesBatch({
					db,
					customerLicenseLinkId: batchTransition.customerLicenseLinkId,
					operation,
					batchSize,
				}),
		});
		return { replaced: 0, added: 0, removed };
	}

	const added = await executeBatchedMutation({
		db: ctx.db,
		operationName: "Customer base price addition",
		executeBatch: ({ db, batchSize }) =>
			addCustomerBasePricesBatch({
				db,
				customerLicenseLinkId: batchTransition.customerLicenseLinkId,
				assignmentCutoffMs: batchTransition.assignmentCutoffMs,
				customerPriceIds: Array.from({ length: batchSize }, () =>
					generateId("cus_price"),
				),
				operation,
				batchSize,
			}),
	});
	return { replaced: 0, added, removed: 0 };
};
