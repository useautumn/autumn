import type { SubjectState } from "@autumn/balance-engine";
import {
	type ApiBalanceV1,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	fullSubjectToFullCustomer,
	getApiBalance,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

/** The server's row with the worker's balances on it: the worker owns balance, the server owns everything derived from catalog. */
const overlayWorkerRows = ({
	customerEntitlement,
	state,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	state: SubjectState;
}): FullCusEntWithFullCusProduct => {
	const row = state.customerEntitlements.find(
		(candidate) => candidate.id === customerEntitlement.id,
	);
	if (!row) return customerEntitlement;
	const rolloversById = new Map(
		state.rollovers.map((rollover) => [rollover.id, rollover]),
	);
	return {
		...customerEntitlement,
		balance: row.balance,
		adjustment: row.adjustment,
		rollovers: customerEntitlement.rollovers.map((rollover) => {
			const workerRollover = rolloversById.get(rollover.id);
			return workerRollover
				? {
						...rollover,
						balance: workerRollover.balance,
						usage: workerRollover.usage,
					}
				: rollover;
		}),
	};
};

/** The API balance for one feature, with the worker's state overlaid on the server's own FullSubject. */
export function workerStateToApiBalance({
	ctx,
	fullSubject,
	state,
	featureId,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	state: SubjectState;
	featureId: string;
}): ApiBalanceV1 {
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
	});
	const [first] = customerEntitlements;
	if (!first)
		throw new BalanceWorkerUnsupportedError({ reason: "feature_not_found" });
	const { data } = getApiBalance({
		ctx: { ...ctx, expand: [] },
		fullCus: fullSubjectToFullCustomer({ fullSubject }),
		cusEnts: customerEntitlements.map((customerEntitlement) =>
			overlayWorkerRows({ customerEntitlement, state }),
		),
		feature: first.entitlement.feature,
	});
	return data;
}
