import {
	type AutumnBillingPlan,
	CusProductStatus,
	type CustomerLicenseUpdate,
	type Entitlement,
	type FullCusProduct,
	type InsertPlanLicenseSpec,
	type Price,
	type SyncBillingContext,
	type SyncProductContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
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

const EMPTY_IMMEDIATE_RESULT: ImmediatePhaseResult = {
	insertCustomerProducts: [],
	updateCustomerProducts: [],
	customPrices: [],
	customEntitlements: [],
	insertPlanLicenses: [],
	customerLicenseUpdates: [],
};

/**
 * Build cusProducts that start now, plus the existing cusProducts they expire
 * (when `expire_previous` was set). `endsAt` null leaves them open-ended.
 */
const computeStartingNowProductContexts = ({
	ctx,
	syncContext,
	productContexts,
	endsAt,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
	productContexts: SyncProductContext[];
	endsAt: number | null;
}): ImmediatePhaseResult => {
	const {
		fullCustomer,
		stripeSubscription,
		currentEpochMs,
		carryOverUsage,
		carryOverUsages,
	} = syncContext;
	if (!stripeSubscription) return EMPTY_IMMEDIATE_RESULT;

	const insertCustomerProducts: FullCusProduct[] = [];
	const updateCustomerProducts: CustomerProductUpdate[] = [];
	const customPrices: Price[] = [];
	const customEntitlements: Entitlement[] = [];
	const insertPlanLicenses: InsertPlanLicenseSpec[] = [];
	const customerLicenseUpdates: CustomerLicenseUpdate[] = [];

	for (const productContext of productContexts) {
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

		// Rollovers follow the features, not the plan: each one re-homes onto a
		// matching feature on the new plan, or is dropped when none fits.
		const existingRolloversConfig = currentCustomerProduct
			? { fromCustomerProduct: currentCustomerProduct }
			: undefined;

		const insertedCustomerProduct = initImmediateSyncCustomerProduct({
			ctx,
			fullCustomer,
			productContext,
			stripeSubscription,
			currentEpochMs,
			existingUsagesConfig,
			existingRolloversConfig,
		});

		// A following phase ends this one — same shape createSchedule produces.
		// Skipped when there is none, so a canceling sub keeps its Stripe end date.
		if (endsAt !== null) {
			applyScheduleTimingToCustomerProductPlan({
				result: { insertCustomerProduct: insertedCustomerProduct },
				endedAt: endsAt,
			});
		}

		insertCustomerProducts.push(insertedCustomerProduct);
		customPrices.push(...productContext.customPrices);
		customEntitlements.push(...productContext.customEntitlements);
		insertPlanLicenses.push(...(productContext.insertPlanLicenses ?? []));

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
		insertPlanLicenses,
		customerLicenseUpdates,
	};
};

/** The immediate phase's plans, each ending where the next phase starts. */
export const computeSyncImmediatePhase = ({
	ctx,
	syncContext,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
}): ImmediatePhaseResult => {
	const { immediatePhase } = syncContext;
	if (!immediatePhase) return EMPTY_IMMEDIATE_RESULT;

	return computeStartingNowProductContexts({
		ctx,
		syncContext,
		productContexts: immediatePhase.productContexts,
		endsAt: immediatePhase.endsAt,
	});
};

/** Unscheduled plans start now and run across every phase. */
export const computeSyncUnscheduledPlans = ({
	ctx,
	syncContext,
}: {
	ctx: AutumnContext;
	syncContext: SyncBillingContext;
}): ImmediatePhaseResult =>
	computeStartingNowProductContexts({
		ctx,
		syncContext,
		productContexts: syncContext.unscheduledProductContexts,
		endsAt: null,
	});
