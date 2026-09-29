import { CusProductStatus } from "@autumn/shared";
import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import type { BatchResetCusEntsPayload } from "@/queue/workflows.js";
import { CusService } from "../../CusService.js";
import { getFullSubject } from "../../repos/getFullSubject/getFullSubject.js";

const CUSTOMER_REHYDRATION_CONCURRENCY = 5;
const BATCH_SIZE = 100;

/**
 * SQS worker handler: rehydrates each subject, which triggers lazy reset internally.
 * An entity of a balance-worker customer is reset through the worker, never on the SQL lane.
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
					const isEntityReset = Boolean(
						reset.internalEntityId || reset.entityId,
					);
					// The worker is the sole reset writer for its customers; getFull resets every due subject through it.
					const resetsOnSqlLane =
						isEntityReset &&
						!isBalanceWorkerRolloutEnabled({
							ctx,
							customerId: reset.customerId,
						});
					if (resetsOnSqlLane) {
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
				}),
			),
		);
	}
};
