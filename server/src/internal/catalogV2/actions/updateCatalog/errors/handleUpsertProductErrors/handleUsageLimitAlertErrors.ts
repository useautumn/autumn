import type { FullProduct } from "@autumn/shared";
import { assertUsageLimitAlertsResolvable } from "@/internal/balances/usageAlerts/validate/assertUsageLimitAlertsResolvable";

export const handleUsageLimitAlertErrors = ({
	nextFullProduct,
	currentFullProduct,
}: {
	nextFullProduct: FullProduct;
	currentFullProduct: FullProduct | null | undefined;
}): void =>
	assertUsageLimitAlertsResolvable({
		usageAlerts: nextFullProduct.usage_alerts ?? [],
		storedUsageAlerts: currentFullProduct?.usage_alerts,
		usageLimitLists: [nextFullProduct.usage_limits],
	});
