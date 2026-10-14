import type { TrackCommand } from "./types/trackCommand.js";

/** The caller's claim key, or null for a track claiming nothing or its own request id (`track:<requestId>`). */
export const callerKeyOf = ({
	command,
}: {
	command: TrackCommand;
}): string | null => {
	const key = command.idempotency?.key;
	if (!key || key === `track:${command.requestId}`) return null;
	return key;
};
