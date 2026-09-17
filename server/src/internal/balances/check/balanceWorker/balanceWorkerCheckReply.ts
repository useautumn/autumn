import type { CheckCommand } from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client";
import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckResponseV3,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "../../balanceWorker/balanceWorkerErrors.js";
import { workerStateToApiBalance } from "../../balanceWorker/workerStateToApiBalance.js";

/** The one place a worker check reply becomes the API's check response. */
export function checkReplyToApiResponse({
	ctx,
	command,
	reply,
	fullSubject,
}: {
	ctx: AutumnContext;
	command: CheckCommand;
	reply: CheckReply;
	fullSubject: FullSubject;
}): CheckResponseV3 {
	const feature = ctx.features.find(
		(feature) => feature.id === command.featureId,
	);
	if (!feature)
		throw new BalanceWorkerUnsupportedError({ reason: "feature_not_found" });
	const { result, state } = reply;
	return applyResponseVersionChanges<CheckResponseV3>({
		ctx,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Check,
		input: {
			allowed: result.allowed,
			customer_id: command.identity.customerId,
			entity_id: command.identity.entityId ?? undefined,
			required_balance: result.requiredBalance,
			flag: null,
			balance: workerStateToApiBalance({
				ctx,
				fullSubject,
				state,
				featureId: command.featureId,
			}),
		},
		legacyData: { noCusEnts: false, featureToUse: feature },
	});
}
