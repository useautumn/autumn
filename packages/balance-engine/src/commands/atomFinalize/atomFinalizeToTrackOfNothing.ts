import { trackOfNothing } from "../track/trackSourceToRowChange.js";
import type { TrackCommand } from "../track/types/trackCommand.js";
import type { AtomFinalizeCommand } from "./types/atomFinalizeCommand.js";

/** The Atom's finalize as a track that moves nothing: only its source's seq can land. */
export const atomFinalizeToTrackOfNothing = ({
	command,
}: {
	command: AtomFinalizeCommand;
}): TrackCommand =>
	trackOfNothing({
		command: {
			schemaVersion: 1,
			type: "track",
			requestId: command.requestId,
			commandId: command.commandId,
			occurredAt: command.occurredAt,
			identity: command.identity,
			org: command.org,
			featureId: command.featureId,
			internalFeatureId: command.internalFeatureId,
			value: 0,
			overageBehavior: "cap",
			properties: null,
			usageEvent: null,
			source: command.source,
		},
	});
