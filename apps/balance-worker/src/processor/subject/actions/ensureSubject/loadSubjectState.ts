import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { timeSync } from "../../../../logging/eventLoopStalls/syncSections.js";
import type { InFlightLoad } from "../../inFlightLoads/types/inFlightLoad.js";
import { SubjectLoadOvertakenError } from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";
import { keepSubjectBaseline } from "./keepSubjectBaseline.js";
import { measureSubjectState } from "./measureSubjectState.js";
import { readSubjectBaseline } from "./readSubjectBaseline.js";

// Exhausting this takes an evict landing inside every one of these reads, back to back.
const MAX_READS = 4;
const DEFAULT_LARGE_STATE_BYTES = 1_048_576;

/** A customer whose rows are this large is a cost on every command that touches it; name it once, when it is loaded. */
function reportLargeState({
	scope,
	identity,
	baseline,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	baseline: SubjectState;
}): void {
	const logger = scope.ctx.logger;
	if (!logger?.warn) return;
	const limit = scope.ctx.largeStateBytes ?? DEFAULT_LARGE_STATE_BYTES;
	const measure = measureSubjectState({ state: baseline });
	if (measure.bytes < limit) return;
	logger.warn(
		{
			event: "balance_worker.large_subject_state",
			data: { identity, ...measure },
		},
		`Balance worker hydrated a ${Math.round(measure.bytes / 1024)} KiB state for ${identity.customerId} (${measure.rows.customerEntitlements} entitlements, ${measure.rows.replaceables} replaceables, ${measure.rows.rollovers} rollovers)`,
	);
}

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
		reportLargeState({ scope, identity, baseline });
		// Checked with no await before the keep, so overtaken rows never become resident.
		if (!load.overtaken)
			return timeSync({ label: "subject.hydrate" }, () =>
				keepSubjectBaseline({ scope, identity, baseline, occurredAt }),
			);
		load.overtaken = false;
	}
	throw new SubjectLoadOvertakenError({ identity });
};
