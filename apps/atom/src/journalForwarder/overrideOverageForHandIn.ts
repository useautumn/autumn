import type { OverageBehavior, TrackCommand } from "@autumn/balance-engine";

/** A lock's units were already given on the Atom, so Autumn must not refuse its hand-in; a cap lock held only what fit. */
export const atomLockHandInBehavior = ({
	callerBehavior,
}: {
	callerBehavior: OverageBehavior;
}): "cap" | "overflow" => (callerBehavior === "cap" ? "cap" : "overflow");

/** A journaled lock as the Atom hands it in: on its hand-in behaviour, the caller's riding on the lock for its row. */
export const overrideOverageForHandIn = ({
	command,
}: {
	command: TrackCommand;
}): TrackCommand => {
	if (!command.lock) return command;
	const callerOverageBehavior = command.overageBehavior;
	return {
		...command,
		overageBehavior: atomLockHandInBehavior({
			callerBehavior: callerOverageBehavior,
		}),
		lock: { ...command.lock, callerOverageBehavior },
	};
};
