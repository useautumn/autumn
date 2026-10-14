import {
	type AppEnv,
	customerEntitlementToNextResetAt,
	type EntInterval,
	type FullCusProduct,
	type NextResetAtCustomerEntitlement,
	type Organization,
	resetNeedsBillingCycleAnchor,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";

const fetchBillingCycleAnchor = async ({
	customerEntitlement,
	cusProduct,
	org,
	env,
	now,
}: {
	customerEntitlement: NextResetAtCustomerEntitlement;
	cusProduct: FullCusProduct;
	org: Organization;
	env: AppEnv;
	now: number;
}): Promise<number | undefined> => {
	if (!resetNeedsBillingCycleAnchor({ customerEntitlement, now }))
		return undefined;
	const subId = cusProduct.subscription_ids?.[0];
	if (!subId) return undefined;
	try {
		const stripeCli = createStripeCli({ org, env });
		const sub = await stripeCli.subscriptions.retrieve(subId);
		return sub.billing_cycle_anchor * 1000;
	} catch (error) {
		console.log(`[Lazy Reset] WARNING: Failed to check sub anchor: ${error}`);
		return undefined;
	}
};

export const getResetAtUpdate = async ({
	curResetAt,
	interval,
	intervalCount,
	cusProduct,
	org,
	env,
}: {
	curResetAt: number;
	interval: EntInterval;
	intervalCount: number;
	cusProduct: FullCusProduct | null;
	org: Organization;
	env: AppEnv;
}): Promise<number> => {
	const now = Date.now();
	const customerEntitlement: NextResetAtCustomerEntitlement = {
		next_reset_at: curResetAt,
		entitlement: { interval, interval_count: intervalCount },
		customer_product: cusProduct,
	};
	const billingCycleAnchor = cusProduct
		? await fetchBillingCycleAnchor({
				customerEntitlement,
				cusProduct,
				org,
				env,
				now,
			})
		: undefined;
	return customerEntitlementToNextResetAt({
		customerEntitlement,
		billingCycleAnchor,
		now,
	});
};
