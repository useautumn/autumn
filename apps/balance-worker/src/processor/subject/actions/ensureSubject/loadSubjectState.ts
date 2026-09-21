import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import type { InFlightLoad } from "../../inFlightLoads/types/inFlightLoad.js";
import { SubjectLoadOvertakenError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";
import { keepSubjectBaseline } from "./keepSubjectBaseline.js";
import { readSubjectBaseline } from "./readSubjectBaseline.js";

// Exhausting this takes an evict landing inside every one of these reads, back to back.
const MAX_READS = 4;

/** Reads the subject's rows and makes them resident, reading again whenever an evict overtook the read. */
export const loadSubjectState = async ({
	scope,
	identity,
	load,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	load: InFlightLoad;
}): Promise<SubjectState> => {
	for (let read = 0; read < MAX_READS; read++) {
		const occurredAt = scope.ctx.receiptPolicy.now();
		const baseline = await readSubjectBaseline({ scope, identity, occurredAt });
		// Checked with no await before the keep, so overtaken rows never become resident.
		if (!load.overtaken)
			return keepSubjectBaseline({ scope, identity, baseline, occurredAt });
		load.overtaken = false;
	}
	throw new SubjectLoadOvertakenError({ identity });
};
