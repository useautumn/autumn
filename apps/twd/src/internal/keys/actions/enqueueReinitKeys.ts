import { createHash } from "node:crypto";
import type { EnqueueResponse, ReinitScope } from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { toEnqueueResponses } from "../../accounts/actions/toEnqueueResponses.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import { setKeyGate } from "../repos/keyGateRepo.ts";

/** Closes the gate immediately so no new run claims accounts while the job waits for a lease. */
export const enqueueReinitKeys = async ({
	ctx,
	targetPerKey,
	scope = "all",
	platformAccountIds = [],
}: {
	ctx: TwdContext;
	targetPerKey?: number;
	scope?: ReinitScope;
	platformAccountIds?: string[];
}): Promise<EnqueueResponse> => {
	if (scope === "selected" && platformAccountIds.length === 0)
		throw new TwdError({
			status: 400,
			code: "no_keys_selected",
			message: "scope=selected needs at least one platformAccountId.",
			next: "Pick keys, or use scope missing_webhooks / unhealthy / all.",
		});
	const ids = [...new Set(platformAccountIds)].sort();
	const result = await enqueueJob({
		ctx,
		kind: "reinit_keys",
		singletonKey:
			scope === "all"
				? "reinit_keys"
				: `reinit_keys:${scope}${scope === "selected" ? `:${hashIds({ ids })}` : ""}`,
		payload: {
			scope,
			...(targetPerKey !== undefined ? { targetPerKey } : {}),
			...(scope === "selected" ? { platformAccountIds: ids } : {}),
		},
	});
	// Only a full reinit drains every run; scoped reinits lock just their keys.
	if (!result.deduped && scope === "all") {
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

const hashIds = ({ ids }: { ids: string[] }) =>
	createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 12);
