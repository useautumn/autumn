import type { Customer, CustomerBillingControlsParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { assertUsageLimitAlertsResolvable } from "./assertUsageLimitAlertsResolvable.js";
import { fullSubjectToPlanUsageLimits } from "./fullSubjectToPlanUsageLimits.js";
import { hasUsageLimitBasisAlert } from "./hasUsageLimitBasisAlert.js";

export const assertCustomerUsageLimitAlertsResolvable = async ({
	ctx,
	customer,
	billingControls,
}: {
	ctx: AutumnContext;
	customer: Customer;
	billingControls: CustomerBillingControlsParams | null | undefined;
}): Promise<void> => {
	const usageAlerts = billingControls?.usage_alerts;
	if (!hasUsageLimitBasisAlert(usageAlerts)) return;

	const fullSubject = await getFullSubject({
		ctx,
		customerId: customer.id ?? customer.internal_id,
	});
	assertUsageLimitAlertsResolvable({
		usageAlerts,
		storedUsageAlerts: customer.usage_alerts,
		usageLimitLists: [
			billingControls?.usage_limits ?? customer.usage_limits,
			fullSubjectToPlanUsageLimits({ ctx, fullSubject }),
		],
	});
};
