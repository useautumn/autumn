import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { type BatchResetCusEntsPayload, workflows } from "@/queue/workflows.js";
import { getCusEntsNeedingReset } from "./getCusEntsNeedingReset";

/**
 * Checks a list of FullCustomers for entitlements needing reset,
 * and queues an SQS job with the cusEnt IDs if any are found.
 */
export const triggerBatchResetCustomerEntitlements = async ({
	ctx,
	fullCustomers,
}: {
	ctx: AutumnContext;
	fullCustomers: FullCustomer[];
}): Promise<void> => {
	const now = Date.now();

	const resets: BatchResetCusEntsPayload["resets"] = [];
	for (const fullCus of fullCustomers) {
		const cusEntsNeedingReset = getCusEntsNeedingReset({
			fullCus,
			now,
		});

		if (cusEntsNeedingReset.length === 0) continue;

		resets.push({
			internalCustomerId: fullCus.internal_id,
			customerId: fullCus.id ?? "",
			cusEntIds: cusEntsNeedingReset.map((cusEnt) => cusEnt.id),
		});
	}

	if (resets.length === 0) return;

	await workflows.triggerBatchResetCusEnts({
		orgId: ctx.org.id,
		env: ctx.env,
		resets,
	});
};
