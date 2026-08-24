import type {
	FullCusEntWithFullCusProduct,
	TrackResponseV3,
} from "@autumn/shared";
import { customerEntitlementsToApiBalance } from "../balances/customerEntitlementsToApiBalance.js";
import { mutationsToTrackDeductions } from "./mutationsToTrackDeductions.js";
import { resolveReportedFeature } from "./resolveReportedFeature.js";
import type { TrackResult } from "./types/trackResult.js";

// The shard hoists the products out of the rows; the shared balance helpers
// read them back off each row.
const trackResultToCustomerEntitlements = ({
	result,
}: {
	result: TrackResult;
}): FullCusEntWithFullCusProduct[] =>
	result.customer_entitlements.map((customerEntitlement) => ({
		...customerEntitlement,
		customer_product: customerEntitlement.customer_product_id
			? (result.customer_products[customerEntitlement.customer_product_id] ??
				null)
			: null,
	}));

// Row 107. `balances` stays absent: it only appears once the relevant-feature
// set has two entries, which needs credit systems.
export const trackResultToTrackResponse = ({
	result,
}: {
	result: TrackResult;
}): TrackResponseV3 => {
	const feature = resolveReportedFeature({ features: result.features });
	const customerEntitlements = trackResultToCustomerEntitlements({ result });

	return {
		customer_id: result.customer_id,
		entity_id: result.entity_id,
		event_name: result.event_name,
		value: result.value,
		balance: feature
			? customerEntitlementsToApiBalance({ feature, customerEntitlements })
			: null,
		deductions: mutationsToTrackDeductions({
			mutations: result.mutations,
			customerEntitlements,
		}),
	};
};
