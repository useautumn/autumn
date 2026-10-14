import {
	type AllocationView,
	type ApiBalanceV1,
	fullSubjectToCustomerEntitlements,
	getApiBalanceV2,
	orgToInStatuses,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";

export function workerStateToApiBalance({
	ctx,
	fullSubject,
	featureId,
	allocationView,
}: {
	ctx: SharedContext;
	fullSubject: WorkerFullSubject;
	featureId: string;
	allocationView?: AllocationView;
}): ApiBalanceV1 | null {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
		inStatuses: orgToInStatuses({ org: ctx.org }),
	});
	const [first] = customerEntitlements;
	if (!first) return null;
	const { data } = getApiBalanceV2({
		ctx: scopeExpandForCtx({ ctx, prefix: ["balances", "balance"] }),
		fullSubject,
		customerEntitlements,
		feature: first.entitlement.feature,
		allocationView,
	});
	return data;
}
