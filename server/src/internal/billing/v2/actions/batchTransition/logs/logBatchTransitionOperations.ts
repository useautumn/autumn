import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { BasePriceOperation } from "../types/basePriceOperationTypes";
import type { CustomerEntitlementBatchTransition } from "../types/types";

const basePriceOperationToLog = ({
	operation,
}: {
	operation: BasePriceOperation | undefined;
}) => {
	if (!operation) return undefined;
	if (operation.type === "add") {
		return {
			type: operation.type,
			existingBasePriceIds: operation.existingBasePriceIds,
			toPriceId: operation.toPrice.id,
		};
	}
	if (operation.type === "remove") {
		return {
			type: operation.type,
			fromPriceIds: operation.fromPriceIds,
		};
	}
	return {
		type: operation.type,
		fromPriceIds: operation.fromPriceIds,
		toPriceId: operation.toPrice.id,
	};
};

export const logBatchTransitionOperations = ({
	ctx,
	batchTransition,
}: {
	ctx: AutumnContext;
	batchTransition: CustomerEntitlementBatchTransition;
}) => {
	const entitlementPriceOperations =
		batchTransition.operations.entitlementPrices.map((operation) => {
			if (operation.type === "replace") {
				return {
					type: operation.type,
					fromEntitlementIds: operation.fromEntitlementIds,
					toEntitlementId: operation.toEntitlementId,
					fromPriceId: operation.fromEntitlementPrice.price?.id ?? null,
					toPriceId: operation.toEntitlementPrice.price?.id ?? null,
					customerEntitlementPatch: operation.customerEntitlementPatch,
				};
			}
			if (operation.type === "add") {
				return {
					type: operation.type,
					entitlementId: operation.entitlementPrice.entitlement.id,
					priceId: operation.entitlementPrice.price?.id ?? null,
					existingEntitlementIds: operation.existingEntitlementIds,
					initialState: {
						balance: operation.customerEntitlement.balance,
						unlimited: operation.customerEntitlement.unlimited,
						resetCycleAnchor: operation.customerEntitlement.reset_cycle_anchor,
						nextResetAt: operation.customerEntitlement.next_reset_at,
					},
				};
			}
			return {
				type: operation.type,
				entitlementId: operation.entitlementPrice.entitlement.id,
				priceId: operation.entitlementPrice.price?.id ?? null,
				fromEntitlementIds: operation.fromEntitlementIds,
			};
		});

	addToExtraLogs({
		ctx,
		extras: {
			batchTransitionOperations: {
				batchTransitionId: batchTransition.batchTransitionId,
				assignmentCutoffMs: batchTransition.assignmentCutoffMs,
				customerLicenseLinkId: batchTransition.customerLicenseLinkId,
				basePrice: basePriceOperationToLog({
					operation: batchTransition.operations.basePrice,
				}),
				customerEntitlementCycles:
					batchTransition.operations.customerEntitlementCycles,
				entitlementPrices: entitlementPriceOperations,
				unhandledTransitions: batchTransition.unhandledTransitions,
			},
		},
	});
};
