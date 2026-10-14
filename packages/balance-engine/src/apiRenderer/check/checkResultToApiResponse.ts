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
	response: CheckResponseV3;
	feature: Feature;
	balance: ApiBalanceV1 | null;
};

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
	fullSubject: WorkerFullSubject | null;
	isDeductingCheck?: boolean;
}): CheckApiResponse => {
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
					allocationView: "spendable",
				})
			: null;
	const flag =
		attachedSubject && result.isFlag
			? getApiFlag({
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
