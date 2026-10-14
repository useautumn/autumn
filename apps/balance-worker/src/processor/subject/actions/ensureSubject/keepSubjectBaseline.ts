import {
	type MeteringIdentity,
	parseInitializeRequest,
	type SubjectState,
} from "@autumn/balance-engine";
import { initializeSubject } from "../../../actions/initializeSubject.js";
import type { SubjectScope } from "../../types/subject.js";

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
	if ((ctx.baseline ?? "log") === "map")
		return ctx.writer.adopt({ state: baseline, baselineAt: occurredAt });

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
			catalogRows: [],
		},
	});
	const { state } = await initializeSubject({ ctx, request });
	return state;
};
