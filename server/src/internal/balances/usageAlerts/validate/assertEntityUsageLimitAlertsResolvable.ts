import type {
	ApiEntityBillingControlsParams,
	Entity,
	FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { assertUsageLimitAlertsResolvable } from "./assertUsageLimitAlertsResolvable.js";
import { fullSubjectToPlanUsageLimits } from "./fullSubjectToPlanUsageLimits.js";
import { hasUsageLimitBasisAlert } from "./hasUsageLimitBasisAlert.js";

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
	if (!hasUsageLimitBasisAlert(usageAlerts)) return;

	assertUsageLimitAlertsResolvable({
		usageAlerts,
		storedUsageAlerts: entity.usage_alerts,
		usageLimitLists: [
			billingControls?.usage_limits ?? entity.usage_limits,
			fullSubject.customer.usage_limits,
			fullSubjectToPlanUsageLimits({ ctx, fullSubject }),
		],
	});
};
