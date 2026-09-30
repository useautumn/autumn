import {
	type ApiBalanceV1,
	fullSubjectToCustomerEntitlements,
	getApiBalanceV2,
	orgToInStatuses,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";

/** The API balance for one feature, read off the worker's own rows: nothing is loaded from Postgres.
 *  Only plans in the org's statuses count, as legacy renders it; none left is null. */
export function workerStateToApiBalance({
	ctx,
	fullSubject,
	featureId,
}: {
	ctx: SharedContext;
	fullSubject: WorkerFullSubject;
	featureId: string;
}): ApiBalanceV1 | null {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
		inStatuses: orgToInStatuses({ org: ctx.org }),
	});
	const [first] = customerEntitlements;
	if (!first) return null;
	const { data } = getApiBalanceV2({
		// Same scoping as legacy's balances: `balance.feature` expands the feature, a bare `feature` does not.
		ctx: scopeExpandForCtx({ ctx, prefix: ["balances", "balance"] }),
		fullSubject,
		customerEntitlements,
		feature: first.entitlement.feature,
	});
	return data;
}
