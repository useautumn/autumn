import type { CustomerBillingControls } from "@autumn/shared";
import type { AutumnV2_1Client } from "./entitySpendLimitUtils.js";

export const setCustomerSpendLimit = async ({
	autumn,
	customerId,
	featureId,
	overageLimit,
	enabled = true,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	featureId: string;
	overageLimit: number;
	enabled?: boolean;
}) => {
	const billingControls: CustomerBillingControls = {
		spend_limits: [
			{
				feature_id: featureId,
				enabled,
				overage_limit: overageLimit,
			},
		],
	};

	await autumn.customers.update(customerId, {
		billing_controls: billingControls,
	});
};
