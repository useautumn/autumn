import {
	CusProductStatus,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import { workflows } from "@/queue/workflows.js";

/**
 * Checks a list of FullCustomers for entitlements needing reset,
 * and queues an SQS job with the cusEnt IDs if any are found.
 */
export const batchResetCustomerEntitlements = async ({
	fullCustomers,
	orgId,
	env,
}: {
	fullCustomers: FullCustomer[];
	orgId: string;
	env: string;
}): Promise<void> => {
	const now = Date.now();
	const cusEntIds: string[] = [];

	for (const fullCus of fullCustomers) {
		const cusEnts = fullCustomerToCustomerEntitlements({
			fullCustomer: fullCus,
			inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		});

		for (const cusEnt of cusEnts) {
			if (cusEnt.next_reset_at && cusEnt.next_reset_at < now) {
				cusEntIds.push(cusEnt.id);
			}
		}
	}

	if (cusEntIds.length === 0) return;

	await workflows.triggerBatchResetCusEnts({ orgId, env, cusEntIds });
};
