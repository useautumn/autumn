import type {
	CustomerLicenseTransition,
	InitCustomerEntitlementContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { listDistinctEntitlementsByCustomerLicense } from "@/internal/products/entitlements/repos/listDistinctEntitlementsByCustomerLicense";
import { listDistinctBasePricesByCustomerLicense } from "@/internal/products/prices/repos/listDistinctBasePricesByCustomerLicense";
import { computeBatchTransitionOperations } from "../compute/operations/computeBatchTransitionOperations";
import type { ProductTransitions } from "../compute/transitions/computeProductTransitions";
import { enforceDistinctBasePriceLimit } from "../errors/enforceDistinctBasePriceLimit";
import { enforceDistinctEntitlementLimit } from "../errors/enforceDistinctEntitlementLimit";
import type {
	BatchTransitionContext,
	BatchTransitionExecutionScope,
	CustomerEntitlementBatchTransition,
} from "../types/types";
import {
	MAX_DISTINCT_BASE_PRICES,
	MAX_DISTINCT_ENTITLEMENTS,
} from "../utils/batchTransitionConstants";

export const setupCustomerEntitlementBatchTransition = async ({
	ctx,
	transition,
	batchTransitionContext,
	productTransitions,
	executionScope,
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
	batchTransitionContext: BatchTransitionContext;
	productTransitions: ProductTransitions;
	executionScope: BatchTransitionExecutionScope;
}): Promise<CustomerEntitlementBatchTransition> => {
	const fromProduct = transition.outgoingCustomerLicense.planLicense?.product;
	const toProduct = transition.incomingCustomerLicense.planLicense?.product;
	if (!fromProduct || !toProduct) {
		return {
			...executionScope,
			customerLicenseLinkId: transition.updates.linkId,
			operations: {
				basePrice: undefined,
				entitlementPrices: [],
			},
			unhandledTransitions: [],
		};
	}

	const entitlementPriceTransitions = productTransitions.entitlementPrices;
	const hasEntitlementPriceTransitions =
		entitlementPriceTransitions.transitions.length > 0 ||
		entitlementPriceTransitions.added.length > 0 ||
		entitlementPriceTransitions.deleted.length > 0;
	const [candidateOutgoingEntitlements, candidateOutgoingBasePrices] =
		await Promise.all([
			hasEntitlementPriceTransitions
				? listDistinctEntitlementsByCustomerLicense({
						db: ctx.db,
						customerLicenseLinkId: transition.updates.linkId,
						limit: MAX_DISTINCT_ENTITLEMENTS + 1,
					})
				: [],
			productTransitions.basePrice
				? listDistinctBasePricesByCustomerLicense({
						db: ctx.db,
						customerLicenseLinkId: transition.updates.linkId,
						limit: MAX_DISTINCT_BASE_PRICES + 1,
					})
				: [],
		]);
	enforceDistinctEntitlementLimit({
		count: candidateOutgoingEntitlements.length,
	});
	enforceDistinctBasePriceLimit({ count: candidateOutgoingBasePrices.length });

	const customerEntitlementInitContext: InitCustomerEntitlementContext = {
		fullCustomer: batchTransitionContext.fullCustomer,
		fullProduct: toProduct,
		featureQuantities: [],
		resetCycleAnchor: batchTransitionContext.resetCycleAnchorMs,
		freeTrial: null,
		now: batchTransitionContext.currentEpochMs,
	};
	const { operations, unhandledTransitions } = computeBatchTransitionOperations(
		{
			candidateOutgoingEntitlements,
			candidateOutgoingBasePrices,
			productTransitions,
			customerEntitlementInitContext,
			customerEntitlementInitOptions: {
				customerLicenseLinkId: transition.updates.linkId,
			},
		},
	);

	return {
		...executionScope,
		customerLicenseLinkId: transition.updates.linkId,
		operations,
		unhandledTransitions,
	};
};
