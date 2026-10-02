import type { SubjectState } from "@autumn/balance-engine";
import { readSubjectBaseline } from "../../actions/ensureSubject/readSubjectBaseline.js";
import {
	SubjectLoadBusyError,
	SubjectNotFoundError,
} from "../../subjectErrors.js";
import type { SubjectScope } from "../../types/subject.js";
import type { Quarantine } from "../quarantine/createQuarantine.js";
import { SNAPSHOT_QUARANTINE_AFTER } from "../snapshotLoaderLimits.js";
import type { SnapshotWaiting } from "../types/snapshotLoader.js";

/** A miss answered by the full query; a subject that keeps failing it is shut out for a while instead of asked again. */
export const fallbackToFullRead = async ({
	scope,
	waiting,
	quarantine,
}: {
	scope: SubjectScope;
	waiting: SnapshotWaiting;
	quarantine: Quarantine;
}): Promise<SubjectState> => {
	const { identity, subjectKey, asOf } = waiting;
	if (quarantine.isShut({ subjectKey, now: scope.ctx.receiptPolicy.now() }))
		throw new SubjectLoadBusyError({ identity });
	try {
		const baseline = await readSubjectBaseline({
			scope,
			identity,
			occurredAt: asOf,
		});
		quarantine.succeeded({ subjectKey });
		return baseline;
	} catch (cause) {
		// An answer, not a failure: the customer is simply not there.
		if (cause instanceof SubjectNotFoundError) throw cause;
		const { entered } = quarantine.failed({
			subjectKey,
			now: scope.ctx.receiptPolicy.now(),
		});
		if (entered)
			scope.ctx.logger?.warn?.(
				{ event: "balance_worker.snapshot_quarantined", data: { identity } },
				`Balance worker quarantined ${identity.customerId}: its full read failed ${SNAPSHOT_QUARANTINE_AFTER} times running`,
			);
		throw cause;
	}
};
