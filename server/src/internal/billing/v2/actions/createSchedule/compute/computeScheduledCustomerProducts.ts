import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	PooledBalanceOp,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { initScheduledCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initScheduledCustomerProduct";

/** Build scheduled customer products to insert and existing ones to delete. */
export const computeScheduledCustomerProducts = ({
	ctx,
	billingContext,
	existingScheduledCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	existingScheduledCustomerProducts: FullCusProduct[];
}) => {
	const insertCustomerProducts: FullCusProduct[] = [];
	const customPrices = [];
	const customEntitlements = [];
	const pooledBalanceOps: PooledBalanceOp[] = [];
	const scheduledPhases: { startsAt: number; customerProductIds: string[] }[] =
		[];

	for (const phaseContext of billingContext.scheduledPhaseContexts) {
		const phaseCustomerProductIds: string[] = [];

		for (const productContext of phaseContext.productContexts) {
			const customerProduct = initScheduledCustomerProduct({
				ctx,
				fullCustomer: billingContext.fullCustomer,
				fullProduct: productContext.fullProduct,
				featureQuantities: productContext.featureQuantities,
				startsAt: phaseContext.startsAt,
				endsAt: phaseContext.endsAt,
				currentEpochMs: billingContext.currentEpochMs,
				externalId: productContext.externalId,
				billingCycleAnchorResetsAt:
					phaseContext.billingCycleAnchor === "phase_start"
						? phaseContext.startsAt
						: null,
				isCustom:
					productContext.customPrices.length > 0 ||
					productContext.customEntitlements.length > 0,
			});
			const prepared = computeAttachPooledBalanceOps({
				customerProduct,
				attachBillingContext: {
					billingStartsAt: phaseContext.startsAt,
					currentEpochMs: billingContext.currentEpochMs,
					fullCustomer: billingContext.fullCustomer,
					planTiming: "end_of_cycle",
					requestedBillingCycleAnchor: undefined,
					skipBillingChanges: billingContext.skipBillingChanges,
				},
				removeCurrentSource: false,
			});
			insertCustomerProducts.push(prepared.customerProduct);
			pooledBalanceOps.push(...prepared.pooledBalanceOps);
			phaseCustomerProductIds.push(prepared.customerProduct.id);
			customPrices.push(...productContext.customPrices);
			customEntitlements.push(...productContext.customEntitlements);
		}

		scheduledPhases.push({
			startsAt: phaseContext.startsAt,
			customerProductIds: phaseCustomerProductIds,
		});
	}

	return {
		insertCustomerProducts,
		deleteCustomerProducts: existingScheduledCustomerProducts,
		customPrices,
		customEntitlements,
		pooledBalanceOps,
		scheduledPhases,
	};
};
