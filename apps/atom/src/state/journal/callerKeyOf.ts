import type { TrackCommand } from "@autumn/balance-engine";

/** The caller's claim key, or null for the Atom's own `track:<requestId>`: the worker's isAtomOwnKey test (consumeTrack.ts). */
export const callerKeyOf = ({
	command,
}: {
	command: TrackCommand;
}): string | null => {
	const key = command.idempotency?.key;
	if (!key || key === `track:${command.requestId}`) return null;
	return key;
};
