import {
	customerRowsToSubjectState,
	type MeteringIdentity,
	parseInitializeRequest,
	type SubjectState,
} from "@autumn/balance-engine";
import { initializeSubject } from "../../../actions/initializeSubject.js";
import { SubjectNotFoundError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";

/** Reads the subject's own rows from Postgres and makes them its baseline: the customer's at revision zero, an entity's at the customer's current revision. */
export const hydrateSubjectState = async ({
	scope,
	identity,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
}): Promise<SubjectState> => {
	const { ctx } = scope;
	const occurredAt = ctx.receiptPolicy.now();
	const envelope = await ctx.db.getSubjectRows({
		identity,
		asOfTimestampMs: occurredAt,
	});
	if (!envelope) throw new SubjectNotFoundError({ identity });
	const baseline = customerRowsToSubjectState({
		identity,
		customer: envelope.customer,
		customerProducts: envelope.customer_products,
		customerPrices: envelope.customer_prices,
		customerEntitlements: envelope.customer_entitlements,
		rollovers: envelope.rollovers,
		usageWindows: envelope.usage_windows,
		entity: envelope.entity,
	});
	// Postgres is the baseline: nothing to log, the rows just become resident.
	if ((ctx.baseline ?? "log") === "map")
		return ctx.writer.adopt({ state: baseline });

	const request = parseInitializeRequest({
		input: {
			command: {
				schemaVersion: 1,
				type: "initialize",
				commandId: `hydrate_${crypto.randomUUID()}`,
				requestId: `hydrate_${identity.customerId}`,
				identity,
				occurredAt,
			},
			state: baseline,
			// Catalog rows are not part of hydration; ensureSubjectCatalog loads whatever the state references.
			catalogRows: [],
		},
	});
	// A server initialize may have landed first; either way the state the worker holds is what the command runs on.
	const { state } = await initializeSubject({ ctx, request });
	return state;
};
