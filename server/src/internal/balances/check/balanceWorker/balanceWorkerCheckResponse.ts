import type { CheckCommand, CheckDecision } from "@autumn/balance-engine";
import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "../../balanceWorker/balanceWorkerErrors.js";
import { meteringBalanceToApiBalance } from "../../balanceWorker/meteringBalanceToApiBalance.js";

export function checkDecisionToCheckResponse({
	ctx,
	command,
	decision,
}: {
	ctx: AutumnContext;
	command: CheckCommand;
	decision: CheckDecision;
}): CheckResponseV3 {
	if (decision.kind === "unsupported")
		throw new BalanceWorkerUnsupportedError({ reason: decision.reason });
	const feature = ctx.features.find(
		(feature) => feature.id === command.featureId,
	);
	if (!feature)
		throw new BalanceWorkerUnsupportedError({ reason: "feature_not_found" });
	return applyResponseVersionChanges<CheckResponseV3>({
		ctx,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Check,
		input: {
			allowed: decision.allowed,
			customer_id: command.identity.customerId,
			entity_id: command.entityId ?? undefined,
			required_balance: decision.requiredBalance,
			flag: null,
			balance: meteringBalanceToApiBalance({
				featureId: command.featureId,
				snapshot: decision.balanceSnapshot,
			}),
		},
		legacyData: { noCusEnts: false, featureToUse: feature },
	});
}
