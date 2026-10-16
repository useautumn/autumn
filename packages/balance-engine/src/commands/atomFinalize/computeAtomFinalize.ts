import type { DeductionDecision } from "../../deduction/types/deductionDecision.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { findOpenLockById } from "../../utils/subjectStateUtils/openLockIndex.js";
import { computeFinalizeDecision } from "../finalize/computeFinalize.js";
import { computeTrackDecision } from "../track/computeTrack.js";
import {
	isLandedSeq,
	trackSourceToRowChange,
} from "../track/trackSourceToRowChange.js";
import { atomFinalizeToFinalize } from "./atomFinalizeToFinalize.js";
import { atomFinalizeToTrackOfNothing } from "./atomFinalizeToTrackOfNothing.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

/** Settled only when the lock is still open, is the one the Atom named, and this journal entry has not landed before. */
const settlesHeldLock = ({
	fullSubject,
	command,
	lock,
}: {
	fullSubject: WorkerFullSubject;
	command: AtomFinalizeCommand;
	lock: WorkerLock;
}): boolean =>
	findOpenLockById({ openLocks: fullSubject.open_locks, id: lock.id }) !==
		null &&
	lock.customer_id === command.identity.customerId &&
	lock.entity_id === command.identity.entityId &&
	lock.feature_id === command.featureId &&
	!isLandedSeq({ source: command.source, customer: fullSubject.customer });

/** Settles Autumn's own row for the lock the Atom named, its seq landing in the same mutation; otherwise only the seq lands. */
export const computeAtomFinalizeDecision = ({
	fullSubject,
	command,
	lock,
}: {
	fullSubject: WorkerFullSubject;
	command: AtomFinalizeCommand;
	/** Autumn's row for the lock id, wherever the caller found it; null when it holds none. */
	lock: WorkerLock | null;
}): DeductionDecision => {
	if (!lock || !settlesHeldLock({ fullSubject, command, lock }))
		return computeTrackDecision({
			fullSubject,
			command: atomFinalizeToTrackOfNothing({ command }),
		});
	const { mutation, outcome } = computeFinalizeDecision({
		fullSubject,
		command: atomFinalizeToFinalize({ command, lock }),
	});
	const seqChange = trackSourceToRowChange({
		source: command.source,
		customer: fullSubject.customer,
	});
	return {
		mutation: {
			...mutation,
			changes: seqChange ? [...mutation.changes, seqChange] : mutation.changes,
		},
		outcome,
	};
};

export const computeAtomFinalize = (
	params: Parameters<typeof computeAtomFinalizeDecision>[0],
): SubjectStateMutation => computeAtomFinalizeDecision(params).mutation;
