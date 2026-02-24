import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchResetCusEntsPayload } from "@/queue/workflows.js";
import { CusService } from "../../CusService.js";

/**
 * SQS worker handler: fetches each FullCustomer via CusService.getFull,
 * which triggers the lazy reset internally.
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
			batch.map((reset) =>
				CusService.getFull({
					ctx,
					idOrInternalId: reset.internalCustomerId,
					inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
				}),
			),
		);
	}
};
