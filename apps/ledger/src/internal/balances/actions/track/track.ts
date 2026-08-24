import type { Command } from "../../../../api/types/command.js";
import type { CommandOutcome } from "../../../shard/types/commandOutcome.js";
import type { ShardContext } from "../../../shard/types/shardContext.js";
import { applyBalancePlan } from "../../execute/applyBalancePlan.js";
import { setupBalanceContext } from "../../setup/setupBalanceContext.js";
import { computeTrackPlan } from "./compute/computeTrackPlan.js";
import { handleTrackComputeErrors } from "./errors/handleTrackComputeErrors.js";
import { trackContextToTrackResult } from "./result/trackContextToTrackResult.js";
import { assertSupportedTrackRequest } from "./setup/assertSupportedTrackRequest.js";
import { setupTrackContext } from "./setup/setupTrackContext.js";

const OK = 200;

export const track = ({
	ctx,
	command,
}: {
	ctx: ShardContext;
	command: Command;
}): CommandOutcome => {
	// 1. Setup — the request-shape guard runs before any feature is resolved.
	assertSupportedTrackRequest({ body: command.body });
	const balanceContext = setupBalanceContext({ ctx, command });
	const trackContext = setupTrackContext({ balanceContext });

	// 2. Compute
	const plan = computeTrackPlan({ trackContext });

	// 3. Errors — nothing has been written yet
	handleTrackComputeErrors({ trackContext, plan });

	// 4. Execute
	const entry = applyBalancePlan({ ctx, balanceContext: trackContext, plan });

	// 5. Result
	return {
		result: {
			id: command.id,
			status: OK,
			body: trackContextToTrackResult({ trackContext, plan }),
		},
		entry,
	};
};
