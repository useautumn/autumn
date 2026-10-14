import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { timeSync } from "../../../../logging/eventLoopStalls/syncSections.js";
import type { InFlightRead } from "../../inFlightLoads/types/inFlightLoad.js";
import { SubjectLoadOvertakenError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";
import { keepSubjectBaseline } from "./keepSubjectBaseline.js";

const MAX_READS = 4;

export const hydrateSubject = async ({
	scope,
	identity,
	read,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	read: (params: { rowsOnly: boolean }) => Promise<InFlightRead>;
}): Promise<SubjectState> => {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	for (let attempt = 0; attempt < MAX_READS; attempt++) {
		for (
			let evicted = scope.ctx.writer.waitForEvicted({ customerKey });
			evicted;
			evicted = scope.ctx.writer.waitForEvicted({ customerKey })
		)
			await evicted;
		const { read: rows, load } = await read({ rowsOnly: attempt > 0 });
		if (load.overtaken) continue;
		return timeSync({ label: "subject.hydrate" }, () =>
			keepSubjectBaseline({
				scope,
				identity,
				baseline: rows.baseline,
				occurredAt: rows.baselineAt,
			}),
		);
	}
	throw new SubjectLoadOvertakenError({ identity });
};
