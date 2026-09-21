import {
	type MeteringIdentity,
	parseInitializeRequest,
	type SubjectState,
} from "@autumn/balance-engine";
import { initializeSubject } from "../../../actions/initializeSubject.js";
import type { SubjectScope } from "../../types/subject.js";

/** Makes the rows resident: the customer's at revision zero, an entity's at the customer's current revision. */
export const keepSubjectBaseline = async ({
	scope,
	identity,
	baseline,
	occurredAt,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	baseline: SubjectState;
	occurredAt: number;
}): Promise<SubjectState> => {
	const { ctx } = scope;
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
