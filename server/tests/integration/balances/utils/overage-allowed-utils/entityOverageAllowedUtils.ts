import type { EntityBillingControls } from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario.js";

type AutumnV2_1Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_1"];

export const setEntityOverageAllowed = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	enabled = true,
}: {
	autumn: AutumnV2_1Client;
	customerId: string;
	entityId: string;
	featureId: string;
	enabled?: boolean;
}) => {
	const billingControls: EntityBillingControls = {
		overage_allowed: [
			{
				feature_id: featureId,
				enabled,
			},
		],
	};

	await autumn.entities.update(customerId, entityId, {
		billing_controls: billingControls,
	});
};
