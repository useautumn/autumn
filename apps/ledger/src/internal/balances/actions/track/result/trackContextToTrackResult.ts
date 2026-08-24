import type {
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
import type { TrackResult } from "../../../../../api/track/types/trackResult.js";
import type { SubjectBalance } from "../../../types/subjectBalance.js";
import type { TrackContext } from "../types/trackContext.js";
import type { TrackPlan } from "../types/trackPlan.js";

const DEFAULT_VALUE = 1;

// The row as the fold left it, without its product: many rows share one product,
// so the result carries the products once beside them.
const customerEntitlementToReportedRow = ({
	customerEntitlement,
	after,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	after: Record<string, SubjectBalance>;
}): FullCustomerEntitlement => {
	const { customer_product: _customerProduct, ...reported } =
		customerEntitlement;
	const settled = after[reported.id];
	if (settled) {
		reported.balance = settled.balance;
		reported.adjustment = settled.adjustment;
	}

	return reported;
};

const customerEntitlementsToCustomerProductsById = ({
	customerEntitlements,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
}): Record<string, FullCusProduct> => {
	const customerProducts: Record<string, FullCusProduct> = {};
	for (const { customer_product: customerProduct } of customerEntitlements) {
		if (customerProduct)
			customerProducts[customerProduct.id] ??= customerProduct;
	}

	return customerProducts;
};

// The facts the fold settled on. Shaping them into the API response is the
// client's job, so the writer thread never pays for it.
export const trackContextToTrackResult = ({
	trackContext,
	plan,
}: {
	trackContext: TrackContext;
	plan: TrackPlan;
}): TrackResult => {
	const { body } = trackContext.command;
	const { customerEntitlements } = trackContext.subject;

	return {
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		event_name: body.event_name,
		value: body.value ?? DEFAULT_VALUE,
		features: trackContext.features,
		customer_products: customerEntitlementsToCustomerProductsById({
			customerEntitlements,
		}),
		customer_entitlements: customerEntitlements.map((customerEntitlement) =>
			customerEntitlementToReportedRow({
				customerEntitlement,
				after: plan.after,
			}),
		),
		mutations: plan.mutations,
	};
};
