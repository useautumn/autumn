import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { timeSync } from "../../../../logging/eventLoopStalls/syncSections.js";
import type { InFlightRead } from "../../inFlightLoads/types/inFlightLoad.js";
import { SubjectLoadOvertakenError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";
import { keepSubjectBaseline } from "./keepSubjectBaseline.js";

// Exhausting this takes an evict landing inside every one of these reads, back to back.
const MAX_READS = 4;

/** Makes the subject's rows resident from a shared read, reading again whenever an evict overtook the read. */
export const hydrateSubject = async ({
	scope,
	identity,
	read,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	/** The read to share; `rowsOnly` after an overtaken read, since the snapshot may predate the DELETE still on the lane. */
	read: (params: { rowsOnly: boolean }) => Promise<InFlightRead>;
}): Promise<SubjectState> => {
	// A subject dropped for space may still have committed writes the store lacks; the read must not miss them.
	const committedLanding = scope.ctx.writer.waitForCommittedToStore();
	if (committedLanding) await committedLanding;
	for (let attempt = 0; attempt < MAX_READS; attempt++) {
		const { read: rows, load } = await read({ rowsOnly: attempt > 0 });
		// Checked with no await before the keep, so overtaken rows never become resident.
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
