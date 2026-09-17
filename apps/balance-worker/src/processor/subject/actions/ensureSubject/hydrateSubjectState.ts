import {
	customerRowsToSubjectState,
	type MeteringIdentity,
	parseInitializeCommand,
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

	const command = parseInitializeCommand({
		input: {
			schemaVersion: 1,
			type: "initialize",
			commandId: `hydrate_${crypto.randomUUID()}`,
			requestId: `hydrate_${identity.customerId}`,
			identity,
			state: customerRowsToSubjectState({
				identity,
				customer: envelope.customer,
				customerProducts: envelope.customer_products,
				customerEntitlements: envelope.customer_entitlements,
				rollovers: envelope.rollovers,
				entity: envelope.entity,
			}),
			// Catalog rows are not part of hydration; ensureSubjectCatalog loads whatever the state references.
			catalogRows: [],
			occurredAt,
		},
	});
	const decision = await initializeSubject({ ctx, command });
	// A server initialize may have landed first; either way the committed state is what the command runs on.
	if (decision.kind === "already_initialized") {
		const state = ctx.writer.readFreshestState({ identity });
		if (state) return state;
		throw new SubjectNotFoundError({ identity });
	}
	return decision.state;
};
