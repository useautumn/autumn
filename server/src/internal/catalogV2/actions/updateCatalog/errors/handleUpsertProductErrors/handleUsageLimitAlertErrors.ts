import type { FullProduct } from "@autumn/shared";
import { assertUsageLimitAlertsResolvable } from "@/internal/balances/usageAlerts/validate/assertUsageLimitAlertsResolvable";

export const handleUsageLimitAlertErrors = ({
	nextFullProduct,
}: {
	nextFullProduct: FullProduct;
}): void =>
	assertUsageLimitAlertsResolvable({
		usageAlerts: nextFullProduct.usage_alerts ?? [],
		usageLimitLists: [nextFullProduct.usage_limits],
	});
