import {
	type Catalog,
	type SubjectState,
	subjectStateToFullSubject,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import {
	type ApiBalanceV1,
	fullSubjectToCustomerEntitlements,
	getApiBalanceV2,
	orgToInStatuses,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** The customer as the worker decided on it: its rows joined with the catalog rows the reply carried. */
export const workerReplyToFullSubject = ({
	state,
	catalog,
	entityId,
}: {
	state: SubjectState;
	catalog: Catalog;
	entityId?: string | null;
}): WorkerFullSubject =>
	subjectStateToFullSubject({ state, catalog, entityId: entityId ?? null });

/** The API balance for one feature, read off the worker's own rows: nothing is loaded from Postgres.
 *  Only plans in the org's statuses count, as legacy renders it; none left is null. */
export function workerStateToApiBalance({
	ctx,
	fullSubject,
	featureId,
}: {
	ctx: AutumnContext;
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
