import type { TrackCommand } from "@autumn/balance-engine";

/**
 * The Atom's hand-in override: a lock's units were already given on the Atom, so Autumn must not refuse the hand-in (a
 * cap lock held only what fit). The caller's behaviour rides on the lock, for the row a finalize above it reads.
 */
export const overrideOverageForHandIn = ({
	command,
}: {
	command: TrackCommand;
}): TrackCommand => {
	if (!command.lock) return command;
	return {
		...command,
		overageBehavior: command.overageBehavior === "cap" ? "cap" : "overflow",
		lock: { ...command.lock, overageBehavior: command.overageBehavior },
	};
};
