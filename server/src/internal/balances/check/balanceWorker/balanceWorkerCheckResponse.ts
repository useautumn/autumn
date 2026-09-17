import type { CheckCommand, CheckDecision } from "@autumn/balance-engine";
import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckResponseV3,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "../../balanceWorker/balanceWorkerErrors.js";
import { workerCustomerEntitlementToApiBalance } from "../../balanceWorker/workerCustomerEntitlementToApiBalance.js";

export function checkDecisionToCheckResponse({
	ctx,
	command,
	decision,
	fullSubject,
}: {
	ctx: AutumnContext;
	command: CheckCommand;
	decision: CheckDecision;
	fullSubject: FullSubject;
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
			entity_id: command.identity.entityId ?? undefined,
			required_balance: decision.requiredBalance,
			flag: null,
			balance: workerCustomerEntitlementToApiBalance({
				ctx,
				fullSubject,
				customerEntitlement: decision.customerEntitlement,
			}),
		},
		legacyData: { noCusEnts: false, featureToUse: feature },
	});
}
