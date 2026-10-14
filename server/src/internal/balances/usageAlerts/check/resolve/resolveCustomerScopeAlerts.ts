import {
	filterUsageAlertsForFeature,
	type ScopedUsageAlerts,
} from "@autumn/balance-webhooks";
import {
	type Feature,
	type FullCustomer,
	fullCustomerToPlanProducts,
	getPlanBillingControlProducts,
} from "@autumn/shared";

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
