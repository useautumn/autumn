import type { ApplyBillingPlanReply } from "@autumn/balance-worker-client/protocol";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import type { DecidedMutation } from "../../writer/types/mutation.js";

export const replyOnceStored = async ({
	scope,
	decided,
}: {
	scope: PartitionProcessorScope;
	decided: DecidedMutation<ApplyBillingPlanReply>;
}): Promise<ApplyBillingPlanReply> => {
	const committed = await decided.waitForCommit();
	if ("mutation" in committed)
		return {
			result: { status: "applied" },
			state: committed.state,
			catalog: scope.ctx.subjectHydrator.readCatalog({
				state: committed.state,
			}),
		};
	await decided.waitForStore();
	return committed;
};
