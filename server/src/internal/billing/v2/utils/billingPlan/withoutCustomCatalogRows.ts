import type { AutumnBillingPlan } from "@autumn/shared";

/** For re-executing a plan whose custom catalog rows were already inserted; inserting them again fails on their primary keys. */
export const withoutCustomCatalogRows = <T extends AutumnBillingPlan>(
	autumnBillingPlan: T,
): T => ({
	...autumnBillingPlan,
	customPrices: undefined,
	customEntitlements: undefined,
	customFreeTrial: undefined,
});
