import {
	type CustomerLicenseQuantity,
	cusProductToProduct,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	type PhaseProrationBehavior,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type {
	GrantedLicense,
	InstanceConfig,
	LicenseConfig,
} from "./types/instanceConfig";

const DEFAULT_PLAN_QUANTITY = 1;

export const customerProductToGrantedLicenses = (
	customerProduct: FullCusProduct,
): GrantedLicense[] =>
	(customerProduct.customer_licenses ?? []).flatMap((customerLicense) =>
		customerLicense.planLicense
			? [
					{
						licensePlanId: customerLicense.planLicense.product.id,
						granted: customerLicense.granted,
						paidQuantity: customerLicense.paid_quantity,
					},
				]
			: [],
	);

/** Whether the row's start is a future billing cycle reset; a past reset no longer matters. */
const resetsBillingCycleAtStart = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}) =>
	customerProduct.billing_cycle_anchor_resets_at != null &&
	truncateMsToSecondPrecision(
		customerProduct.billing_cycle_anchor_resets_at,
	) === truncateMsToSecondPrecision(customerProduct.starts_at) &&
	customerProduct.starts_at > now;

/** How the row's future start bills; a start already past no longer matters. */
const prorationBehaviorAtStart = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}) =>
	customerProduct.starts_at > now
		? (customerProduct.phase_proration_behavior ?? null)
		: null;

export const customerProductToInstanceConfig = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}): InstanceConfig => ({
	fullProduct: {
		...cusProductToProduct({ cusProduct: customerProduct }),
		internal_id: customerProduct.internal_product_id,
	},
	featureQuantities: customerProduct.options ?? [],
	licenses: {
		type: "granted",
		licenses: customerProductToGrantedLicenses(customerProduct),
	},
	planQuantity: customerProduct.quantity ?? DEFAULT_PLAN_QUANTITY,
	resetsBillingCycle: resetsBillingCycleAtStart({ customerProduct, now }),
	prorationBehavior: prorationBehaviorAtStart({ customerProduct, now }),
});

/** An omitted license list keeps what the instance already holds, or grants the included seats. */
export const requestedPlanToInstanceConfig = ({
	fullProduct,
	featureQuantities,
	customerLicenseQuantities,
	omittedLicenses,
	resetsBillingCycle,
	prorationBehavior,
}: {
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	omittedLicenses: LicenseConfig;
	resetsBillingCycle: boolean;
	prorationBehavior: PhaseProrationBehavior | null;
}): InstanceConfig => ({
	fullProduct,
	featureQuantities,
	licenses: customerLicenseQuantities
		? { type: "requested", quantities: customerLicenseQuantities }
		: omittedLicenses,
	planQuantity: DEFAULT_PLAN_QUANTITY,
	resetsBillingCycle,
	prorationBehavior,
});
