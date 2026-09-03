import type {
	ApiEntityBillingControlsParams,
	Entity,
	FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { assertUsageLimitAlertsResolvable } from "./assertUsageLimitAlertsResolvable.js";
import { fullSubjectToPlanUsageLimits } from "./fullSubjectToPlanUsageLimits.js";
import { writesUsageLimitAlert } from "./writesUsageLimitAlert.js";

/** Entity alerts see the entity's limits as this write leaves them, then the customer's, then the plans'. */
export const assertEntityUsageLimitAlertsResolvable = ({
	ctx,
	entity,
	fullSubject,
	billingControls,
}: {
	ctx: AutumnContext;
	entity: Entity;
	fullSubject: FullSubject;
	billingControls: ApiEntityBillingControlsParams | null | undefined;
}): void => {
	const usageAlerts = billingControls?.usage_alerts;
	if (!writesUsageLimitAlert(usageAlerts)) return;

	assertUsageLimitAlertsResolvable({
		usageAlerts,
		usageLimitLists: [
			billingControls?.usage_limits ?? entity.usage_limits,
			fullSubject.customer.usage_limits,
			fullSubjectToPlanUsageLimits({ ctx, fullSubject }),
		],
	});
};
