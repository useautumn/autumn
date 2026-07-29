import type { Organization } from "@autumn/shared";
import { getDisableOverageBillingCustomers } from "@/internal/misc/featureFlags/featureFlagStore.js";

export const shouldDisableOverageBilling = ({
	org,
	customerId,
	customerConfig,
}: {
	org: Organization;
	customerId: string | null | undefined;
	customerConfig?: { disable_overage_billing?: boolean } | null;
}): boolean => {
	if (customerConfig?.disable_overage_billing !== undefined) {
		return customerConfig.disable_overage_billing;
	}

	if (customerId) {
		const customerIds = getDisableOverageBillingCustomers({ orgId: org.id });
		if (customerIds.includes(customerId)) return true;
	}

	return org.config.disable_overage_billing;
};
