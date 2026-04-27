import type { CustomerBillingControls } from "@autumn/shared";
import { timeout } from "@/utils/genUtils.js";
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

	await timeout(2000);
	await autumn.customers.update(customerId, {
		billing_controls: billingControls,
	});
	await timeout(2000);
};
