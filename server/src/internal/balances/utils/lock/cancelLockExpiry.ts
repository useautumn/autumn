import { deleteSchedule } from "@/external/aws/eventbridge/eventBridgeUtils.js";

/** Cancels the EventBridge expiry schedule for a lock receipt. Safe to call even if no schedule exists. */
export const cancelLockExpiry = async ({
	hashedKey,
}: {
	hashedKey: string;
}) => {
	await deleteSchedule({ scheduleName: `lock-${hashedKey}` });
};
