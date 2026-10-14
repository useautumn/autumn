import { deleteSchedule } from "@/external/aws/eventbridge/eventBridgeUtils.js";
import { buildLockScheduleName } from "./buildLockScheduleName.js";

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
