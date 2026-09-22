import {
	customerRowsToSubjectState,
	type MeteringIdentity,
	type SubjectState,
} from "@autumn/balance-engine";
import { SubjectNotFoundError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";

/** The subject's own rows as Postgres holds them at `occurredAt`. Nothing becomes resident here. */
export const readSubjectBaseline = async ({
	scope,
	identity,
	occurredAt,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	occurredAt: number;
}): Promise<SubjectState> => {
	const envelope = await scope.ctx.db.getSubjectRows({
		identity,
		asOfTimestampMs: occurredAt,
	});
	if (!envelope) throw new SubjectNotFoundError({ identity });
	return customerRowsToSubjectState({
		identity,
		customer: envelope.customer,
		customerProducts: envelope.customer_products,
		customerPrices: envelope.customer_prices,
		customerEntitlements: envelope.customer_entitlements,
		rollovers: envelope.rollovers,
		usageWindows: envelope.usage_windows,
		openLocks: envelope.open_locks,
		pooledBalances: envelope.pooled_balances,
		entity: envelope.entity,
	});
};
