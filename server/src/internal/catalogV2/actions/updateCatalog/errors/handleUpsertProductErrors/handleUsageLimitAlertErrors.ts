import type { FullProduct } from "@autumn/shared";
import { assertUsageLimitAlertsResolvable } from "@/internal/balances/usageAlerts/validate/assertUsageLimitAlertsResolvable";

/** A plan's usage_limit alerts must match a usage limit on the same plan, read off the merged row. */
export const handleUsageLimitAlertErrors = ({
	nextFullProduct,
}: {
	nextFullProduct: FullProduct;
}): void =>
	assertUsageLimitAlertsResolvable({
		usageAlerts: nextFullProduct.usage_alerts ?? [],
		usageLimitLists: [nextFullProduct.usage_limits],
	});
