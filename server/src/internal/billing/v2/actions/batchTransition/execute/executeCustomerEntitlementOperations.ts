import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import type {
	AddEntitlementPriceOperation,
	EntitlementPriceOperation,
	RemoveEntitlementPriceOperation,
	ReplaceEntitlementPriceOperation,
} from "../types/entitlementPriceOperationTypes";
import type { CustomerEntitlementBatchTransition } from "../types/types";
import { BATCH_TRANSITION_OPERATION_CONCURRENCY } from "../utils/batchTransitionConstants";
import { executeBatchedMutation } from "./executeBatchedMutation";
import { addCustomerEntitlementsBatch } from "./sql/addCustomerEntitlementsBatch";
import { deleteCustomerEntitlementsBatch } from "./sql/deleteCustomerEntitlementsBatch";
import { replaceCustomerEntitlementsBatch } from "./sql/replaceCustomerEntitlementsBatch";

const executeReplacement = async ({
	ctx,
	customerLicenseLinkId,
	operation,
}: {
	ctx: AutumnContext;
	customerLicenseLinkId: string;
	operation: ReplaceEntitlementPriceOperation;
}) => {
	if (operation.fromEntitlementIds.length === 0) return 0;
	if (operation.fromEntitlementIds.includes(operation.toEntitlementId)) {
		throw new Error(
			"Batch replacement requires different outgoing and incoming entitlement IDs",
		);
	}

	return executeBatchedMutation({
		db: ctx.db,
		operationName: "Customer entitlement replacement",
		executeBatch: ({ db, batchSize }) =>
			replaceCustomerEntitlementsBatch({
				db,
				customerLicenseLinkId,
				operation,
				batchSize,
			}),
	});
};

const executeAddition = async ({
	ctx,
	batchTransition,
	operation,
}: {
	ctx: AutumnContext;
	batchTransition: CustomerEntitlementBatchTransition;
	operation: AddEntitlementPriceOperation;
}) => {
	return executeBatchedMutation({
		db: ctx.db,
		operationName: "Customer entitlement addition",
		executeBatch: ({ db, batchSize }) =>
			addCustomerEntitlementsBatch({
				db,
				customerLicenseLinkId: batchTransition.customerLicenseLinkId,
				assignmentCutoffMs: batchTransition.assignmentCutoffMs,
				customerEntitlementIds: Array.from({ length: batchSize }, () =>
					generateId("cus_ent"),
				),
				operation,
				batchSize,
			}),
	});
};

const executeRemoval = async ({
	ctx,
	customerLicenseLinkId,
	operation,
}: {
	ctx: AutumnContext;
	customerLicenseLinkId: string;
	operation: RemoveEntitlementPriceOperation;
}) => {
	if (operation.fromEntitlementIds.length === 0) return 0;

	return executeBatchedMutation({
		db: ctx.db,
		operationName: "Customer entitlement deletion",
		executeBatch: ({ db, batchSize }) =>
			deleteCustomerEntitlementsBatch({
				db,
				customerLicenseLinkId,
				operation,
				batchSize,
			}),
	});
};

const operationFeatureId = (operation: EntitlementPriceOperation): string => {
	if (operation.type === "replace") {
		return operation.fromEntitlementPrice.entitlement.internal_feature_id;
	}
	return operation.entitlementPrice.entitlement.internal_feature_id;
};

const groupOperationsByFeature = ({
	operations,
}: {
	operations: EntitlementPriceOperation[];
}): EntitlementPriceOperation[][] => {
	const groups = new Map<string, EntitlementPriceOperation[]>();
	for (const operation of operations) {
		const featureId = operationFeatureId(operation);
		const group = groups.get(featureId) ?? [];
		group.push(operation);
		groups.set(featureId, group);
	}
	return [...groups.values()];
};

const executeOperation = async ({
	ctx,
	batchTransition,
	operation,
}: {
	ctx: AutumnContext;
	batchTransition: CustomerEntitlementBatchTransition;
	operation: EntitlementPriceOperation;
}) => {
	if (operation.type === "replace") {
		return {
			replaced: await executeReplacement({
				ctx,
				customerLicenseLinkId: batchTransition.customerLicenseLinkId,
				operation,
			}),
			added: 0,
			removed: 0,
		};
	}
	if (operation.type === "add") {
		return {
			replaced: 0,
			added: await executeAddition({ ctx, batchTransition, operation }),
			removed: 0,
		};
	}
	return {
		replaced: 0,
		added: 0,
		removed: await executeRemoval({
			ctx,
			customerLicenseLinkId: batchTransition.customerLicenseLinkId,
			operation,
		}),
	};
};

export const executeCustomerEntitlementOperations = async ({
	ctx,
	batchTransition,
}: {
	ctx: AutumnContext;
	batchTransition: CustomerEntitlementBatchTransition;
}) => {
	const limit = pLimit(BATCH_TRANSITION_OPERATION_CONCURRENCY);
	const groups = groupOperationsByFeature({
		operations: batchTransition.operations.entitlementPrices,
	});
	const results = await Promise.all(
		groups.map((operations) =>
			limit(async () => {
				const result = { replaced: 0, added: 0, removed: 0 };
				for (const operation of operations) {
					const operationResult = await executeOperation({
						ctx,
						batchTransition,
						operation,
					});
					result.replaced += operationResult.replaced;
					result.added += operationResult.added;
					result.removed += operationResult.removed;
				}
				return result;
			}),
		),
	);

	return results.reduce(
		(total, result) => ({
			replaced: total.replaced + result.replaced,
			added: total.added + result.added,
			removed: total.removed + result.removed,
		}),
		{ replaced: 0, added: 0, removed: 0 },
	);
};
