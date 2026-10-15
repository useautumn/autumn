import type { TrackCommand } from "./types/trackCommand.js";

/** The caller's claim key, or null for a track that claims nothing. */
export const callerKeyOf = ({
	command,
}: {
	command: TrackCommand;
}): string | null => command.idempotency?.key ?? null;
