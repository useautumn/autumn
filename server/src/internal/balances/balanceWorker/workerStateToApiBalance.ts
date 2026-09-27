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
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

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

/** The API balance for one feature, read off the worker's own rows: nothing is loaded from Postgres. */
export function workerStateToApiBalance({
	ctx,
	fullSubject,
	featureId,
}: {
	ctx: AutumnContext;
	fullSubject: WorkerFullSubject;
	featureId: string;
}): ApiBalanceV1 {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
	});
	const [first] = customerEntitlements;
	if (!first)
		throw new BalanceWorkerUnsupportedError({ reason: "feature_not_found" });
	const { data } = getApiBalanceV2({
		ctx,
		fullSubject,
		customerEntitlements,
		feature: first.entitlement.feature,
	});
	return data;
}
