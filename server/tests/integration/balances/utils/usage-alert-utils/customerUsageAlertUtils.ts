import type { CustomerBillingControls, DbUsageAlert } from "@autumn/shared";
import type { AutumnV2_1Client } from "../spend-limit-utils/entitySpendLimitUtils.js";

export const setCustomerUsageAlerts = async ({
	autumn,
	customerId,
	usageAlerts,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	usageAlerts: DbUsageAlert[];
}) => {
	const billingControls: CustomerBillingControls = {
		usage_alerts: usageAlerts,
	};

	await autumn.customers.update(customerId, {
		billing_controls: billingControls,
	});
};
