import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerLicenseUpdate,
	type Entitlement,
	type FullCusProduct,
	type InsertPlanLicenseSpec,
	type Price,
	type SyncBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";
import { computeCustomerLicenseReleases } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseReleases";
import { resolveSyncExistingUsagesConfig } from "@/internal/billing/v2/utils/handleCarryOvers/resolveSyncExistingUsagesConfig";
import { initImmediateSyncCustomerProduct } from "./initImmediateSyncCustomerProduct";

type CustomerProductUpdate = NonNullable<
	AutumnBillingPlan["updateCustomerProducts"]
>[number];

export type ImmediatePhaseResult = {
	insertCustomerProducts: FullCusProduct[];
	updateCustomerProducts: CustomerProductUpdate[];
	customPrices: Price[];
	customEntitlements: Entitlement[];
	insertPlanLicenses: InsertPlanLicenseSpec[];
	customerLicenseUpdates: CustomerLicenseUpdate[];
	releaseCustomerLicenseAssignments?: NonNullable<
		AutumnBillingPlan["releaseCustomerLicenseAssignments"]
	>;
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
	const {
		immediatePhase,
		fullCustomer,
		stripeSubscription,
		currentEpochMs,
		carryOverUsage,
		carryOverUsages,
	} = syncContext;
	if (!immediatePhase || !stripeSubscription) {
		return {
			insertCustomerProducts: [],
			updateCustomerProducts: [],
			customPrices: [],
			customEntitlements: [],
			insertPlanLicenses: [],
			customerLicenseUpdates: [],
		};
	}

	const insertCustomerProducts: FullCusProduct[] = [];
	const updateCustomerProducts: CustomerProductUpdate[] = [];
	const customPrices: Price[] = [];
	const customEntitlements: Entitlement[] = [];
	const insertPlanLicenses: InsertPlanLicenseSpec[] = [];
	const customerLicenseUpdates: CustomerLicenseUpdate[] = [];
	const droppedCustomerLicenseLinkIds: string[] = [];

	for (const productContext of immediatePhase.productContexts) {
		const currentCustomerProduct = productContext.currentCustomerProduct;
		if (currentCustomerProduct?.product_id === productContext.fullProduct.id) {
			const licenseQuantityChanges = computeCustomerLicenseQuantityChanges({
				customerProduct: currentCustomerProduct,
				customerLicenseQuantities: productContext.customerLicenseQuantities,
			});
			if (licenseQuantityChanges.length > 0) {
				customerLicenseUpdates.push(
					...licenseQuantityChanges.map(({ update }) => update),
				);
				continue;
			}
		}

		const existingUsagesConfig =
			carryOverUsage && currentCustomerProduct
				? resolveSyncExistingUsagesConfig({
						ctx,
						carryOverUsages,
						currentCustomerProduct,
					})
				: undefined;

		const insertedCustomerProduct = initImmediateSyncCustomerProduct({
			ctx,
			fullCustomer,
			productContext,
			stripeSubscription,
			currentEpochMs,
			existingUsagesConfig,
		});

		insertCustomerProducts.push(insertedCustomerProduct);
		customPrices.push(...productContext.customPrices);
		customEntitlements.push(...productContext.customEntitlements);
		insertPlanLicenses.push(...(productContext.insertPlanLicenses ?? []));

		if (productContext.currentCustomerProduct) {
			const release = computeCustomerLicenseReleases({
				outgoingCustomerProduct: productContext.currentCustomerProduct,
				incomingCustomerProduct: insertedCustomerProduct,
				releasedAt: currentEpochMs,
			}).releaseCustomerLicenseAssignments;
			droppedCustomerLicenseLinkIds.push(
				...(release?.customerLicenseLinkIds ?? []),
			);
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
		insertPlanLicenses,
		customerLicenseUpdates,
		releaseCustomerLicenseAssignments: droppedCustomerLicenseLinkIds.length
			? {
					customerLicenseLinkIds: droppedCustomerLicenseLinkIds,
					releasedAt: currentEpochMs,
				}
			: undefined,
	};
};
