import type { CustomerBillingControls } from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { timeout } from "@/utils/genUtils";

type AutumnV2_1Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];

export const setCustomerOverageAllowed = async ({
	autumn,
	customerId,
	featureId,
	enabled = true,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	featureId: string;
	enabled?: boolean;
}) => {
	const billingControls: CustomerBillingControls = {
		overage_allowed: [
			{
				feature_id: featureId,
				enabled,
			},
		],
	};

	await timeout(2000);
	await autumn.customers.update(customerId, {
		billing_controls: billingControls,
	});
	await timeout(2000);
};
