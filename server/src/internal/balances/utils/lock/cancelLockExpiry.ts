import { deleteSchedule } from "@/external/aws/eventbridge/eventBridgeUtils.js";
import { buildLockScheduleName } from "./buildLockScheduleName.js";

/** Cancels the EventBridge expiry schedule for a lock receipt. Safe to call even if no schedule exists. */
export const cancelLockExpiry = async ({
	orgId,
	env,
	hashedKey,
}: {
	orgId: string;
	env: string;
	hashedKey: string;
}) => {
	const scheduleName = buildLockScheduleName({ orgId, env, hashedKey });
	await deleteSchedule({ scheduleName });
};
