import {
	type Feature,
	type FullCustomer,
	fullCustomerToPlanProducts,
	getPlanBillingControlProducts,
} from "@autumn/shared";
import type { ScopedUsageAlerts } from "../types/scopedUsageAlerts.js";
import { filterUsageAlertsForFeature } from "./filterEnabledUsageAlertsForFeature.js";

/**
 * The customer's own alerts measure the aggregate balance. Plan alerts are a
 * fallback at the same scope, used only when the customer has none for the feature.
 */
export const resolveCustomerScopeAlerts = ({
	fullCustomer,
	feature,
}: {
	fullCustomer: FullCustomer;
	feature: Feature;
}): ScopedUsageAlerts => {
	const customerAlerts = filterUsageAlertsForFeature({
		alerts: fullCustomer.usage_alerts ?? [],
		feature,
	});
	if (customerAlerts.length > 0) {
		return { scope: "customer", alerts: customerAlerts };
	}

	const planProduct = getPlanBillingControlProducts({
		customerProducts: fullCustomerToPlanProducts({ fullCustomer }),
	}).find(
		(customerProduct) =>
			filterUsageAlertsForFeature({
				alerts: customerProduct.product?.usage_alerts ?? [],
				feature,
			}).length > 0,
	);

	return {
		scope: "plan",
		alerts: filterUsageAlertsForFeature({
			alerts: planProduct?.product?.usage_alerts ?? [],
			feature,
		}),
	};
};
