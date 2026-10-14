import { idempotencyKeys } from "@trigger.dev/sdk/v3";

export const atomWatchIdempotencyKey = ({
	deploymentGroupId,
}: {
	deploymentGroupId: string;
}) => idempotencyKeys.create(deploymentGroupId, { scope: "global" });
