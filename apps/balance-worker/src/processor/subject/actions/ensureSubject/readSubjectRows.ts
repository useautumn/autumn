import type { MeteringIdentity } from "@autumn/balance-engine";
import { loadSubjectBaseline } from "../../snapshotLoader/loadSubjectBaseline.js";
import type { SubjectScope } from "../../types/subject.js";
import type { SubjectRead } from "../../types/subjectRead.js";
import {
	measureSubjectState,
	type SubjectStateMeasure,
} from "./measureSubjectState.js";
import { readSubjectBaseline } from "./readSubjectBaseline.js";

const DEFAULT_LARGE_STATE_BYTES = 1_048_576;

/** A customer whose rows are this large is a cost on every command that touches it; name it once, when it is read. */
const reportLargeState = ({
	scope,
	identity,
	measure,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	measure: SubjectStateMeasure;
}): void => {
	const logger = scope.ctx.logger;
	if (!logger?.warn) return;
	const limit = scope.ctx.largeStateBytes ?? DEFAULT_LARGE_STATE_BYTES;
	if (measure.bytes < limit) return;
	logger.warn(
		{
			event: "balance_worker.large_subject_state",
			data: { identity, ...measure },
		},
		`Balance worker hydrated a ${Math.round(measure.bytes / 1024)} KiB state for ${identity.customerId} (${measure.rows.customerEntitlements} entitlements, ${measure.rows.replaceables} replaceables, ${measure.rows.rollovers} rollovers)`,
	);
};

/**
 * One read of the subject for now: through the snapshot probe, or the rows alone when the caller cannot trust a row
 * (a read an evict overtook, a refresh of the row itself). Nothing becomes resident here.
 */
export const readSubjectRows = async ({
	scope,
	identity,
	rowsOnly,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	rowsOnly: boolean;
}): Promise<SubjectRead> => {
	const occurredAt = scope.ctx.receiptPolicy.now();
	const baseline = rowsOnly
		? await readSubjectBaseline({ scope, identity, occurredAt })
		: await loadSubjectBaseline({ scope, identity, occurredAt });
	const measure = measureSubjectState({ state: baseline });
	reportLargeState({ scope, identity, measure });
	return { baseline, baselineAt: occurredAt, bytes: measure.bytes };
};
