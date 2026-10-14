import type { AutumnBillingPlan } from "@autumn/shared";

export const withoutCustomCatalogRows = <T extends AutumnBillingPlan>(
	autumnBillingPlan: T,
): T => ({
	...autumnBillingPlan,
	customPrices: undefined,
	customEntitlements: undefined,
	customFreeTrial: undefined,
});
