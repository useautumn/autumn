import type { IdempotencyKey } from "@trigger.dev/sdk/v3";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isTriggerConfigured } from "@/trigger/configureTrigger.js";
import { atomWatchIdempotencyKey } from "./atomWatchIdempotencyKey.js";

/** Starts the group's watch, or joins the one running. Without Trigger, page reads still refresh the record. */
export const startAtomWatch = async ({
	ctx,
	deploymentGroupId,
	triggerWatch,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
	triggerWatch: (params: {
		idempotencyKey: IdempotencyKey;
	}) => Promise<unknown>;
}): Promise<void> => {
	if (!isTriggerConfigured()) return;
	try {
		await triggerWatch({
			idempotencyKey: await atomWatchIdempotencyKey({ deploymentGroupId }),
		});
	} catch (error) {
		// The change it follows already landed; a missing watch only slows updates.
		ctx.logger.warn("Failed to start the Atom watch", {
			data: { deploymentGroupId, error: String(error) },
		});
	}
};
