import { idempotencyKeys } from "@trigger.dev/sdk/v3";

/** One watch per deployment group, whoever starts it. */
export const atomWatchIdempotencyKey = ({
	deploymentGroupId,
}: {
	deploymentGroupId: string;
}) => idempotencyKeys.create(deploymentGroupId, { scope: "global" });
