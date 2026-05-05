import {
	type AutumnBillingPlan,
	CusProductStatus,
	type Entitlement,
	type FullCusProduct,
	type Price,
	type SyncBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initImmediateSyncCustomerProduct } from "./initImmediateSyncCustomerProduct";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

export type ImmediatePhaseResult = {
	insertCustomerProducts: FullCusProduct[];
	updateCustomerProducts: CustomerProductUpdate[];
	customPrices: Price[];
	customEntitlements: Entitlement[];
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
 * Build the immediate-phase cusProducts to insert plus the existing
 * cusProducts to expire (when `expire_previous` was set on the input plan).
 *
 * Returns an empty result when the sync has no immediate phase or no live
 * Stripe subscription to derive lifecycle metadata from.
 */
export const computeSyncImmediatePhase = ({
	ctx,
	syncContext,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
}): ImmediatePhaseResult => {
	const { immediatePhase, fullCustomer, stripeSubscription, currentEpochMs } =
		syncContext;
	if (!immediatePhase || !stripeSubscription) {
		return {
			insertCustomerProducts: [],
			updateCustomerProducts: [],
			customPrices: [],
			customEntitlements: [],
		};
	}

	const insertCustomerProducts: FullCusProduct[] = [];
	const updateCustomerProducts: CustomerProductUpdate[] = [];
	const customPrices: Price[] = [];
	const customEntitlements: Entitlement[] = [];

	for (const productContext of immediatePhase.productContexts) {
		insertCustomerProducts.push(
			initImmediateSyncCustomerProduct({
				ctx,
				fullCustomer,
				productContext,
				stripeSubscription,
				currentEpochMs,
			}),
		);
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

	return {
		insertCustomerProducts,
		updateCustomerProducts,
		customPrices,
		customEntitlements,
	};
};
