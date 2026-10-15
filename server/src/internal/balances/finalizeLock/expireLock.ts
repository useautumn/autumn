import { RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ExpireLockReceiptPayload } from "@/queue/workflows.js";
import { getBalanceLock } from "./balanceWorker/getBalanceLock.js";
import { runFinalizeLock } from "./runFinalizeLock.js";

/** A timer armed for one lock row outlives it once that row settled, whatever lock now holds its lock id. */
const outlivedItsLock = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: ExpireLockReceiptPayload;
}): Promise<boolean> => {
	if (!payload.lockRowId) return false;
	const lock = await getBalanceLock({
		ctx,
		lockId: payload.lockId,
		customerId: payload.customerId,
	});
	return lock?.id !== payload.lockRowId;
};

export const expireLock = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: ExpireLockReceiptPayload;
}) => {
	if (await outlivedItsLock({ ctx, payload })) return;
	try {
		ctx.skipCache = false;
		await runFinalizeLock({
			ctx,
			params: {
				lock_id: payload.lockId,
				customer_id: "",
				action: "release",
				override_value: 0,
			},
		});
	} catch (error) {
		if (
			error instanceof RecaseError &&
			error.message.includes("Lock not found")
		) {
			return;
		}
		throw error;
	}
};
