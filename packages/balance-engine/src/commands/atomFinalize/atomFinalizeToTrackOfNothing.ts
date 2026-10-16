import { LockNotFoundError } from "../../errors.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import { trackOfNothing } from "../track/trackSourceToRowChange.js";
import type { TrackCommand } from "../track/types/trackCommand.js";
import { lockFeatureOf } from "./lockFeatureOf.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

/**
 * The Atom's finalize as a track that moves nothing: only its source's seq can land, under the lock's feature. An
 * undecided finalize of a lock Autumn holds no row for names no feature at all: refused, as a finalize of a lock already
 * gone is.
 */
export const atomFinalizeToTrackOfNothing = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): TrackCommand => {
	const feature = lockFeatureOf({ command, lock });
	if (!feature) throw new LockNotFoundError({ lockId: command.lockId });
	return trackOfNothing({
		command: {
			schemaVersion: 1,
			type: "track",
			requestId: command.requestId,
			commandId: command.commandId,
			occurredAt: command.occurredAt,
			identity: command.identity,
			org: command.org,
			...feature,
			value: 0,
			overageBehavior: "cap",
			properties: null,
			usageEvent: null,
			source: command.source,
		},
	});
};
