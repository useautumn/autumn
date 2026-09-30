import {
	AffectedResource,
	type ApiBalanceV1,
	type ApiVersionClass,
	applyResponseVersionChanges,
	type CheckResponseV3,
	type Feature,
	findFeatureById,
	fullSubjectToCustomerEntitlements,
	getApiFlag,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { CheckCommand } from "../../commands/check/types/checkCommand.js";
import type { CheckResult } from "../../commands/check/types/checkResult.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { workerStateToApiBalance } from "../balances/workerStateToApiBalance.js";
import { workerSubjectsToApiBalances } from "../balances/workerSubjectsToApiBalances.js";

export type CheckApiResponse = {
	/** The check response at the caller's API version. */
	response: CheckResponseV3;
	/** The feature that answered: the checked one, or the credit system funding it. */
	feature: Feature;
	/** That feature's balance before any version change; null for a flag or when nothing is attached. */
	balance: ApiBalanceV1 | null;
};

/** The one place the engine's check answer becomes the API's check response, whether it came from a check or a track. */
export const checkResultToApiResponse = ({
	ctx,
	apiVersion,
	command,
	result,
	fullSubject,
	isDeductingCheck = false,
}: {
	ctx: SharedContext;
	apiVersion: ApiVersionClass;
	command: CheckCommand;
	result: CheckResult;
	/** The subject the check was decided on; null when there were no rows to read. */
	fullSubject: WorkerFullSubject | null;
	/** The check deducts (`send_event` or a lock), so it also answers with the legacy track `balances` map. */
	isDeductingCheck?: boolean;
}): CheckApiResponse => {
	// The engine names the feature that answers: the checked one, or the credit system funding it.
	const feature = findFeatureById({
		features: ctx.features,
		featureId: result.fundingFeatureId ?? command.featureId,
		errorOnNotFound: true,
	});
	const isAttached = result.fundingFeatureId !== null;
	const attachedSubject = isAttached ? fullSubject : null;
	const balance =
		attachedSubject && !result.isFlag
			? workerStateToApiBalance({
					ctx,
					fullSubject: attachedSubject,
					featureId: feature.id,
				})
			: null;
	const flag =
		attachedSubject && result.isFlag
			? getApiFlag({
					// Same scoping as the legacy subject's flags, so `flag.feature` expands the flag's feature.
					ctx: scopeExpandForCtx({ ctx, prefix: ["flags", "flag"] }),
					cusEnts: fullSubjectToCustomerEntitlements({
						fullSubject: attachedSubject,
						featureIds: [feature.id],
					}),
					feature,
				}).data
			: null;
	const balances =
		isDeductingCheck && result.allowed && attachedSubject
			? workerSubjectsToApiBalances({
					ctx,
					subjects: [
						{ featureId: command.featureId, fullSubject: attachedSubject },
					],
				})
			: {};
	const response = applyResponseVersionChanges<CheckResponseV3>({
		ctx,
		targetVersion: apiVersion,
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
		legacyData: { noCusEnts: !isAttached, featureToUse: feature },
	});
	return { response, feature, balance };
};
