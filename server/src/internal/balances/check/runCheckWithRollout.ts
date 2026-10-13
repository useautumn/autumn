import type { ParsedCheckParams } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import {
	checkDeductionNotQueuedError,
	failOpenCheckDeducts,
	queueFailOpenCheckDeduction,
} from "@/internal/api/check/checkUtils/failOpenCheckDeduction.js";
import {
	type CheckFailOpenReason,
	getCheckFailOpenFallback,
} from "@/internal/api/check/checkUtils/getCheckFailOpenFallback.js";
import { isFullSubjectGateRejection } from "@/internal/customers/repos/getFullSubject/getFullSubjectGate.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { runCheckV2 } from "./runCheckV2.js";
import type { RunCheckResult } from "./types.js";

export const runCheckWithRollout = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<RunCheckResult<CheckData | CheckDataV2>> => {
	const deducts = failOpenCheckDeducts({ ctx, body });
	const failOpen = ({
		error,
		reason,
	}: {
		error: unknown;
		reason: CheckFailOpenReason;
	}): RunCheckResult<CheckData | CheckDataV2> => ({
		checkData: null,
		response: getCheckFailOpenFallback({
			ctx,
			body,
			requiredBalance,
			error,
			reason,
			deductionQueued: deducts,
		}) as Record<string, unknown>,
	});

	if (ctx.orgRateLimitDegraded) {
		// As track does: a send_event check's deduction is queued, and runs live if the queue refuses it.
		if (
			!deducts ||
			(await queueFailOpenCheckDeduction({ ctx, body, requiredBalance }))
		)
			return failOpen({
				error: new Error("org aggregate rate cap exceeded"),
				reason: "org_rate_limit",
			});
	}

	return withRedisFailOpen<RunCheckResult<CheckData | CheckDataV2>>({
		source: "runCheckWithRollout",
		run: () => runCheckV2({ ctx, body, requiredBalance }),
		alsoFailOpen: isFullSubjectGateRejection,
		fallback: async (error) => {
			if (
				deducts &&
				!(await queueFailOpenCheckDeduction({ ctx, body, requiredBalance }))
			)
				throw checkDeductionNotQueuedError();
			return failOpen({ error, reason: "dependency_error" });
		},
	});
};
