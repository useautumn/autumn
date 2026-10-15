import type { TrackCommand } from "@autumn/balance-engine";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { scheduleLockExpiry } from "@/internal/balances/balanceWorker/lockExpirySchedule.js";
import type { HandedInCommand } from "./atomTracksToCommands.js";

const isReleaseLockTrack = (
	command: HandedInCommand,
): command is TrackCommand & { lock: NonNullable<TrackCommand["lock"]> } =>
	command.type === "track" && command.lock?.expiryAction === "release";

/** A queued lock the caller set an expiry on gets the API path's timer, named for its row; a confirm lock is the sweep's. */
export const scheduleAtomLockExpiries = async ({
	ctx,
	commands,
}: {
	ctx: AutumnContext;
	commands: HandedInCommand[];
}): Promise<void> => {
	await Promise.all(
		commands.filter(isReleaseLockTrack).map(({ identity, lock }) =>
			scheduleLockExpiry({
				ctx,
				customerId: identity.customerId,
				lock: { lock_id: lock.lockId, expires_at: lock.expiresAt },
				lockRowId: lock.id,
			}),
		),
	);
};
