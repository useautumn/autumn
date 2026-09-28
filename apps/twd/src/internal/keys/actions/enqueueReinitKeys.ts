import type { EnqueueResponse } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { toEnqueueResponses } from "../../accounts/actions/toEnqueueResponses.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import { setKeyGate } from "../repos/keyGateRepo.ts";

/** Closes the gate immediately so no new run claims accounts while the job waits for a lease. */
export const enqueueReinitKeys = async ({
	ctx,
	targetPerKey,
}: {
	ctx: TwdContext;
	targetPerKey?: number;
}): Promise<EnqueueResponse> => {
	const result = await enqueueJob({
		ctx,
		kind: "reinit_keys",
		singletonKey: "reinit_keys",
		payload: targetPerKey ? { targetPerKey } : {},
	});
	if (!result.deduped) {
		await setKeyGate({
			db: ctx.db,
			gate: {
				state: "draining",
				reason: "re-initialising Stripe keys",
				jobId: result.job.id,
			},
		});
	}
	const [response] = await toEnqueueResponses({ ctx, results: [result] });
	return response;
};
