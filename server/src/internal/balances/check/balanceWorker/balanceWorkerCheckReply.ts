import type { CheckCommand } from "@autumn/balance-engine";
import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckResponseV3,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	getApiFlag,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	workerReplyToFullSubject,
	workerStateToApiBalance,
} from "../../balanceWorker/workerStateToApiBalance.js";
import { workerSubjectsToApiBalances } from "../../balanceWorker/workerSubjectsToApiBalances.js";
import type { WorkerCheckAnswer } from "./runDeductingCheck.js";

/** The one place a worker's answer becomes the API's check response, whether it came from a check or a track. */
export function checkAnswerToApiResponse({
	ctx,
	command,
	answer,
	deducted = false,
}: {
	ctx: AutumnContext;
	command: CheckCommand;
	answer: WorkerCheckAnswer;
	/** The check deducted (`send_event` or a lock), so it also answers with the legacy track `balances` map. */
	deducted?: boolean;
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
					// Same scoping as the legacy subject's flags, so `flag.feature` expands the flag's feature.
					ctx: scopeExpandForCtx({ ctx, prefix: ["flags", "flag"] }),
					cusEnts: fullSubjectToCustomerEntitlements({
						fullSubject,
						featureIds: [featureToUse.id],
					}),
					feature: featureToUse,
				}).data
			: null;
	const balances =
		deducted && result.allowed && fullSubject
			? workerSubjectsToApiBalances({
					ctx,
					subjects: [{ featureId: command.featureId, fullSubject }],
				})
			: {};
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
			balances: Object.keys(balances).length < 2 ? undefined : balances,
		},
		legacyData: { noCusEnts: !isAttached, featureToUse },
	});
}
