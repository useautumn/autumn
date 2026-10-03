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
import { backfillSnapshot } from "./backfillSnapshot.js";
import { verifySnapshot } from "./verifySnapshot.js";

/**
 * A subject answered by the full query; a subject that keeps failing it is shut out for a while instead of asked again.
 * A miss is written back; a row carried along (verifying) is compared with the answer instead.
 */
export const fallbackToFullRead = async ({
	scope,
	waiting,
	snapshot,
	quarantine,
}: {
	scope: SubjectScope;
	waiting: SnapshotWaiting;
	snapshot: SubjectState | null;
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
		if (snapshot) verifySnapshot({ scope, identity, snapshot, baseline });
		else backfillSnapshot({ scope, waiting, baseline });
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
