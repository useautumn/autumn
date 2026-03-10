import { RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ExpireLockReceiptPayload } from "@/queue/workflows.js";
import { runFinalizeLock } from "./runFinalizeLock.js";

export const expireLock = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: ExpireLockReceiptPayload;
}) => {
	try {
		ctx.skipCache = false;
		await runFinalizeLock({
			ctx,
			params: {
				lock_key: payload.lockKey,
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
