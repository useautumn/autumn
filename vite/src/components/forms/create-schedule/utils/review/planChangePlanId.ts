import type { CustomerPlanChange } from "@autumn/shared";

export const planChangePlanId = (change: CustomerPlanChange) =>
	change.subscription?.plan_id ?? change.purchase?.plan_id ?? "";
