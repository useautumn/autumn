import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { CustomerEntitlementBatchTransition } from "../types/types";
import { BATCH_TRANSITION_OPERATION_CONCURRENCY } from "../utils/batchTransitionConstants";
import { executeBatchedMutation } from "./executeBatchedMutation";
import { alignCustomerEntitlementCyclesBatch } from "./sql/alignCustomerEntitlementCyclesBatch";

export const executeCustomerEntitlementCycleOperations = async ({
	ctx,
	batchTransition,
}: {
	ctx: AutumnContext;
	batchTransition: CustomerEntitlementBatchTransition;
}): Promise<number> => {
	const limit = pLimit(BATCH_TRANSITION_OPERATION_CONCURRENCY);
	const results = await Promise.all(
		batchTransition.operations.customerEntitlementCycles.map((operation) =>
			limit(() =>
				executeBatchedMutation({
					db: ctx.db,
					operationName: "Customer entitlement cycle alignment",
					executeBatch: ({ db, batchSize }) =>
						alignCustomerEntitlementCyclesBatch({
							db,
							customerLicenseLinkId:
								batchTransition.customerLicenseLinkId,
							operation,
							batchSize,
						}),
				}),
			),
		),
	);
	return results.reduce((total, affected) => total + affected, 0);
};
