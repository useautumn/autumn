import { LockNotFoundError } from "../../errors.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import { trackOfNothing } from "../track/trackSourceToRowChange.js";
import type { TrackCommand } from "../track/types/trackCommand.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

/**
 * The Atom's finalize as a track that moves nothing: only its source's seq can land, under the lock's feature. An
 * undecided finalize of a lock Autumn holds no row for names no feature to land under: refused, as a finalize of a
 * lock already gone is.
 */
export const atomFinalizeToTrackOfNothing = ({
	command,
	lock,
}: {
	command: AtomFinalizeCommand;
	lock: WorkerLock | null;
}): TrackCommand => {
	const featureId = command.featureId ?? lock?.feature_id;
	const { internalFeatureId } = command;
	if (!featureId || !internalFeatureId)
		throw new LockNotFoundError({ lockId: command.lockId });
	return trackOfNothing({
		command: {
			schemaVersion: 1,
			type: "track",
			requestId: command.requestId,
			commandId: command.commandId,
			occurredAt: command.occurredAt,
			identity: command.identity,
			org: command.org,
			featureId,
			internalFeatureId,
			value: 0,
			overageBehavior: "cap",
			properties: null,
			usageEvent: null,
			source: command.source,
		},
	});
};
