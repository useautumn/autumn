import { CusProductStatus } from "@autumn/shared";
import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchResetCusEntsPayload } from "@/queue/workflows.js";
// import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { CusService } from "../../CusService.js";
import { getFullSubject } from "../../repos/getFullSubject/getFullSubject.js";

const CUSTOMER_REHYDRATION_CONCURRENCY = 5;
const BATCH_SIZE = 100;

/**
 * SQS worker handler: rehydrates each subject, which triggers lazy reset internally.
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

	const limit = pLimit(CUSTOMER_REHYDRATION_CONCURRENCY);

	for (let i = 0; i < resets.length; i += BATCH_SIZE) {
		const batch = resets.slice(i, i + BATCH_SIZE);

		await Promise.all(
			batch.map((reset) =>
				limit(async () => {
					if (reset.internalEntityId || reset.entityId) {
						await getFullSubject({
							ctx,
							customerId: reset.internalCustomerId,
							entityId: reset.internalEntityId ?? reset.entityId,
							inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
						});
						return;
					}

					await CusService.getFull({
						ctx,
						idOrInternalId: reset.internalCustomerId,
						inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
					});

					// V2 subject cache path: triggers lazyResetSubjectEntitlements
					// if (isFullSubjectRolloutEnabled({ ctx })) {
					// 	await getFullSubject({
					// 		ctx,
					// 		customerId: reset.internalCustomerId,
					// 		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
					// 	});
					// }
				}),
			),
		);
	}
};
