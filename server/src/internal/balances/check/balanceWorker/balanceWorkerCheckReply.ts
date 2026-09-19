import type { CheckCommand } from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client";
import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckResponseV3,
	type FullSubject,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	getApiFlag,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
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
	const { result, state } = reply;
	// The worker names the feature that answers: the checked one, or the credit system funding it.
	const featureToUse = findFeatureById({
		features: ctx.features,
		featureId: result.fundingFeatureId ?? command.featureId,
		errorOnNotFound: true,
	});
	const isAttached = result.fundingFeatureId !== null;
	const balance =
		isAttached && !result.isFlag
			? workerStateToApiBalance({
					ctx,
					fullSubject,
					state,
					featureId: featureToUse.id,
				})
			: null;
	const flag =
		isAttached && result.isFlag
			? getApiFlag({
					ctx,
					cusEnts: fullSubjectToCustomerEntitlements({
						fullSubject,
						featureIds: [featureToUse.id],
					}),
					feature: featureToUse,
				}).data
			: null;
	return applyResponseVersionChanges<CheckResponseV3>({
		ctx,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Check,
		input: {
			allowed: result.allowed,
			customer_id: command.identity.customerId,
			entity_id: command.identity.entityId ?? undefined,
			required_balance: result.requiredBalance,
			flag,
			balance,
		},
		legacyData: { noCusEnts: !isAttached, featureToUse },
	});
}
