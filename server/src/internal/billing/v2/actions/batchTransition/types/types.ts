import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import type { BasePriceOperation } from "./basePriceOperationTypes";
import type { CustomerEntitlementCycleOperation } from "./customerEntitlementCycleOperationTypes";
import type { EntitlementPriceOperation } from "./entitlementPriceOperationTypes";

export type BatchTransitionContext = {
	fullCustomer: FullCustomer;
	parentCustomerProduct: FullCusProduct;
	currentEpochMs: number;
	resetCycleAnchorMs: number | "now";
};

export type BatchTransitionOperations = {
	basePrice: BasePriceOperation | undefined;
	customerEntitlementCycles: CustomerEntitlementCycleOperation[];
	entitlementPrices: EntitlementPriceOperation[];
};

export type BatchTransitionExecutionScope = {
	batchTransitionId: string;
	assignmentCutoffMs: number;
};

export type BatchMutationResult = {
	affected: number;
	hasMore: boolean;
};

export type EntitlementIdTransition = {
	fromEntitlementId: string;
	toEntitlementId: string;
};

export type CustomerEntitlementBatchTransition =
	BatchTransitionExecutionScope & {
		customerLicenseLinkId: string;
		operations: BatchTransitionOperations;
		unhandledTransitions: EntitlementIdTransition[];
	};
