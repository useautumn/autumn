import { LockNotFoundError } from "../../errors.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import type { ConfirmExpiredLockCommand } from "./types/confirmExpiredLockCommand.js";

/** Deletes the lock row and, with it, the id the subject holds: one mutation, no balance touched. */
export const computeConfirmExpiredLock = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: ConfirmExpiredLockCommand;
}): SubjectStateMutation => {
	assertCommandSupported({ fullSubject, command });
	const { lock } = command;

	// A lock finalized since the sweep read it is simply gone; nothing is written for it.
	const isOpen = fullSubject.open_locks.some(
		(openLock) => openLock.id === lock.id,
	);
	if (!isOpen) throw new LockNotFoundError({ lockId: lock.lock_id });

	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
			revision: {
				before: fullSubject.revision,
				after: fullSubject.revision + 1,
			},
			command,
			changes: [{ table: "locks", op: "delete", id: lock.id }],
			result: { type: "confirmExpiredLock", status: "expired" },
		},
	});
};
