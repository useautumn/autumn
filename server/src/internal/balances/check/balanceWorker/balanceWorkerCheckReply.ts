import type { CheckCommand } from "@autumn/balance-engine";
import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckResponseV3,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	getApiFlag,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	workerReplyToFullSubject,
	workerStateToApiBalance,
} from "../../balanceWorker/workerStateToApiBalance.js";
import type { WorkerCheckAnswer } from "./runDeductingCheck.js";

/** The one place a worker's answer becomes the API's check response, whether it came from a check or a track. */
export function checkAnswerToApiResponse({
	ctx,
	command,
	answer,
}: {
	ctx: AutumnContext;
	command: CheckCommand;
	answer: WorkerCheckAnswer;
}): CheckResponseV3 {
	const { result, state, catalog } = answer;
	// The worker names the feature that answers: the checked one, or the credit system funding it.
	const featureToUse = findFeatureById({
		features: ctx.features,
		featureId: result.fundingFeatureId ?? command.featureId,
		errorOnNotFound: true,
	});
	const isAttached = result.fundingFeatureId !== null;
	// The worker's reply is the customer: its rows and the catalog they were decided against.
	const fullSubject =
		state && catalog && isAttached
			? workerReplyToFullSubject({
					state,
					catalog,
					entityId: command.identity.entityId,
				})
			: null;
	const balance =
		fullSubject && !result.isFlag
			? workerStateToApiBalance({
					ctx,
					fullSubject,
					featureId: featureToUse.id,
				})
			: null;
	const flag =
		fullSubject && result.isFlag
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
