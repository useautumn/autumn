import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchResetCusEntsPayload } from "@/queue/workflows.js";
import { CusService } from "../../CusService.js";
import { CusEntService } from "../../cusProducts/cusEnts/CusEntitlementService.js";
import { resetCustomerEntitlements } from "./resetCustomerEntitlements.js";

/**
 * SQS worker handler: fetches cusEnts by ID, groups by customer,
 * fetches each FullCustomer, and runs the lazy reset logic.
 */
export const runBatchResetCusEntsTask = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: BatchResetCusEntsPayload;
}): Promise<void> => {
	const { db, org, env } = ctx;
	const { cusEntIds } = payload;

	if (cusEntIds.length === 0) return;

	// Fetch cusEnts to get their internal_customer_id for grouping
	const cusEnts = await CusEntService.getByIds({ db, ids: cusEntIds });

	// Group by internal_customer_id
	const byCustomer = new Map<string, string[]>();
	for (const cusEnt of cusEnts) {
		const cusId = cusEnt.internal_customer_id;
		if (!byCustomer.has(cusId)) {
			byCustomer.set(cusId, []);
		}
		byCustomer.get(cusId)!.push(cusEnt.id);
	}

	// For each customer, fetch full customer and run reset
	for (const [internalCustomerId] of byCustomer) {
		try {
			const fullCus = await CusService.getFull({
				ctx,
				idOrInternalId: internalCustomerId,
				inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
			});

			await resetCustomerEntitlements({
				fullCus,
				db,
				org,
				env,
			});
		} catch (error) {
			console.error(
				`[BatchResetCusEnts] Failed to reset for customer ${internalCustomerId}:`,
				error,
			);
		}
	}
};
