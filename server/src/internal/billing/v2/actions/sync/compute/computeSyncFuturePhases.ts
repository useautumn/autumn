import type {
	Entitlement,
	FullCusProduct,
	Price,
	SyncBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initScheduledCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initScheduledCustomerProduct";

export type ComputedSchedulePhase = {
	startsAt: number;
	endsAt: number | null;
	customerProductIds: string[];
};

export type FuturePhasesResult = {
	insertCustomerProducts: FullCusProduct[];
	customPrices: Price[];
	customEntitlements: Entitlement[];
	scheduledPhases: ComputedSchedulePhase[];
};

/**
 * Build cusProducts (status=Scheduled) for every non-immediate phase plus
 * the per-phase descriptors that `persistSyncPhases` writes after execute.
 */
export const computeSyncFuturePhases = ({
	ctx,
	syncContext,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
}): FuturePhasesResult => {
	const {
		futurePhases,
		fullCustomer,
		currentEpochMs,
		stripeSubscription,
		stripeSchedule,
	} = syncContext;

	const insertCustomerProducts: FullCusProduct[] = [];
	const customPrices: Price[] = [];
	const customEntitlements: Entitlement[] = [];
	const scheduledPhases: ComputedSchedulePhase[] = [];

	for (const phaseContext of futurePhases) {
		const phaseIds: string[] = [];

		for (const productContext of phaseContext.productContexts) {
			const cusProduct = initScheduledCustomerProduct({
				ctx,
				fullCustomer,
				fullProduct: productContext.fullProduct,
				featureQuantities: productContext.featureQuantities,
				startsAt: phaseContext.startsAt,
				endsAt: phaseContext.endsAt,
				currentEpochMs,
				subscriptionId: stripeSubscription?.id,
				subscriptionScheduleId: stripeSchedule?.id,
			});
			insertCustomerProducts.push(cusProduct);
			phaseIds.push(cusProduct.id);
			customPrices.push(...productContext.customPrices);
			customEntitlements.push(...productContext.customEntitlements);
		}

		scheduledPhases.push({
			startsAt: phaseContext.startsAt,
			endsAt: phaseContext.endsAt,
			customerProductIds: phaseIds,
		});
	}

	return {
		insertCustomerProducts,
		customPrices,
		customEntitlements,
		scheduledPhases,
	};
};
