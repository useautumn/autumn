import {
	type AutumnBillingPlan,
	CusProductStatus,
	type Entitlement,
	type FullCusProduct,
	type Price,
	type SyncBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initScheduledCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initScheduledCustomerProduct";

export type ComputedSchedulePhase = {
	startsAt: number;
	endsAt: number | null;
	customerProductIds: string[];
};

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

export type FuturePhasesResult = {
	insertCustomerProducts: FullCusProduct[];
	updateCustomerProducts: CustomerProductUpdate[];
	customPrices: Price[];
	customEntitlements: Entitlement[];
	scheduledPhases: ComputedSchedulePhase[];
};

const expireCustomerProduct = ({
	customerProduct,
	currentEpochMs,
}: {
	customerProduct: FullCusProduct;
	currentEpochMs: number;
}): CustomerProductUpdate => ({
	customerProduct,
	updates: {
		status: CusProductStatus.Expired,
		ended_at: currentEpochMs,
		canceled: true,
		canceled_at: currentEpochMs,
	},
});

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
	const updateCustomerProducts: CustomerProductUpdate[] = [];
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
				entity: productContext.entity,
				startsAt: phaseContext.startsAt,
				endsAt: phaseContext.endsAt,
				currentEpochMs,
				accessStartsAt: productContext.accessStartsAt,
				subscriptionId: stripeSubscription?.id,
				subscriptionScheduleId: stripeSchedule?.id,
				internalEntityId: productContext.entity?.internal_id,
			});
			insertCustomerProducts.push(cusProduct);
			phaseIds.push(cusProduct.id);
			customPrices.push(...productContext.customPrices);
			customEntitlements.push(...productContext.customEntitlements);

			if (productContext.currentCustomerProduct) {
				updateCustomerProducts.push(
					expireCustomerProduct({
						customerProduct: productContext.currentCustomerProduct,
						currentEpochMs,
					}),
				);
			}
		}

		scheduledPhases.push({
			startsAt: phaseContext.startsAt,
			endsAt: phaseContext.endsAt,
			customerProductIds: phaseIds,
		});
	}

	return {
		insertCustomerProducts,
		updateCustomerProducts,
		customPrices,
		customEntitlements,
		scheduledPhases,
	};
};
