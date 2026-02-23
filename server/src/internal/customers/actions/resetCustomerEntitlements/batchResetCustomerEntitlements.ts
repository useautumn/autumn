import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchResetCusEntsPayload } from "@/queue/workflows.js";
import { CusService } from "../../CusService.js";
import { resetCustomerEntitlements } from "./resetCustomerEntitlements.js";

/**
 * SQS worker handler: fetches cusEnts by ID, groups by customer,
 * fetches each FullCustomer, and runs the lazy reset logic.
 */
export const batchResetCustomerEntitlements = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: BatchResetCusEntsPayload;
}): Promise<void> => {
	const { resets } = payload;

	if (resets.length === 0) return;

	const BATCH_SIZE = 100;

	for (let i = 0; i < resets.length; i += BATCH_SIZE) {
		const batch = resets.slice(i, i + BATCH_SIZE);

		await Promise.all(
			batch.map(async (reset) => {
				const fullCus = await CusService.getFull({
					ctx,
					idOrInternalId: reset.internalCustomerId,
					inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
				});

				await resetCustomerEntitlements({
					ctx,
					fullCus,
				});
			}),
		);
	}
};
