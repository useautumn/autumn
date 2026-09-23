import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";
import {
	executeCustomerLicenseTransitions,
	type PendingBatchTransition,
} from "@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions";
import { executeCustomerLicenseUpdates } from "@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseUpdates";
import { insertCustomerLicensePools } from "@/internal/billing/v2/execute/executeAutumnActions/insertCustomerLicensePools";
import { repointSchedulePhases } from "@/internal/billing/v2/execute/executeAutumnActions/repointSchedulePhases";
import { writeCustomerEntitlementReplaceables } from "@/internal/billing/v2/execute/executeAutumnActions/writeCustomerEntitlementReplaceables";

/** The rows the balance worker does not hold yet: license pools and counters, schedule phases, replaceables. */
export const writePostgresOnlyRows = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PendingBatchTransition[]> => {
	await executeCustomerLicenseUpdates({
		ctx,
		customerLicenseUpdates: autumnBillingPlan.customerLicenseUpdates,
	});

	await insertCustomerLicensePools({
		ctx,
		customerProducts: autumnBillingPlan.insertCustomerProducts,
	});

	const pendingBatchTransitions = await executeCustomerLicenseTransitions({
		ctx,
		customerLicenseTransitions: autumnBillingPlan.customerLicenseTransitions,
	});

	await repointSchedulePhases({ ctx, autumnBillingPlan });

	for (const update of autumnBillingPlan.updateCustomerEntitlements ?? [])
		await writeCustomerEntitlementReplaceables({ ctx, update });

	return pendingBatchTransitions;
};

/** Most plans (a create, a link-back) have none, so the worker path skips a transaction for them. */
export const planHasPostgresOnlyRows = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): boolean =>
	(autumnBillingPlan.customerLicenseUpdates?.length ?? 0) > 0 ||
	autumnBillingPlan.insertCustomerProducts.some(
		({ customer_licenses }) => (customer_licenses?.length ?? 0) > 0,
	) ||
	(autumnBillingPlan.customerLicenseTransitions?.length ?? 0) > 0 ||
	(autumnBillingPlan.schedulePhaseCustomerProductReplacements?.length ?? 0) >
		0 ||
	(!autumnBillingPlan.ownsSchedulePersistence &&
		computeSchedulePhaseReplacements({ autumnBillingPlan }).length > 0) ||
	(autumnBillingPlan.updateCustomerEntitlements ?? []).some(
		({ insertReplaceables, deletedReplaceables }) =>
			(insertReplaceables?.length ?? 0) > 0 ||
			(deletedReplaceables?.length ?? 0) > 0,
	);
