import {
	BillingInterval,
	BillingMethod,
	EntitlementDuration,
	type FullCustomer,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";

export const EXPIRY = { duration: EntitlementDuration.Month, length: 2 };

export const expiringItem = {
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount: 10,
		interval: BillingInterval.OneOff,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
	expiry: EXPIRY,
};

export const expiringTopUpPlan = (planId: string) => ({
	plan_id: planId,
	name: "Expiring Top-Up",
	add_on: true,
	items: [expiringItem],
});

/** Manual top-up only routes on a one-off prepaid item hosted by a RECURRING
 * plan, so the top-up cases need a base price. */
export const expiringTopUpOnRecurringPlan = (planId: string) => ({
	plan_id: planId,
	name: "Expiring Top-Up Host",
	price: { amount: 20, interval: BillingInterval.Month },
	items: [expiringItem],
});

export const messageRows = ({
	fullCustomer,
	planId,
}: {
	fullCustomer: FullCustomer;
	planId: string;
}) => {
	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === planId,
	);
	const keystones = (customerProduct?.customer_entitlements ?? []).filter(
		(ce) => ce.entitlement.feature.id === TestFeature.Messages,
	);
	const grants = fullCustomer.extra_customer_entitlements.filter(
		(ce) =>
			ce.entitlement.feature.id === TestFeature.Messages &&
			ce.metadata?.source != null,
	);
	return { customerProduct, keystones, grants };
};
