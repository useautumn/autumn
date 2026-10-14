import type { TrackCommand } from "@autumn/balance-engine";
import type { JournalEntry } from "../journal/types/journal.js";

/**
 * The locked tracks this slot took, by customer and lock_id, so a retried lock_id is compared with the terms it was
 * taken on. Memory only: after a restart a lock still owed is read back from the journal.
 */
export const createOpenLocks = () => {
	const tracksByCustomer = new Map<string, Map<string, TrackCommand>>();

	function hold({ track }: { track: TrackCommand }): void {
		const lockId = track.lock?.lockId;
		if (!lockId) return;
		const { customerId } = track.identity;
		const tracks = tracksByCustomer.get(customerId) ?? new Map();
		tracks.set(lockId, track);
		tracksByCustomer.set(customerId, tracks);
	}

	function trackOf({
		customerId,
		lockId,
		owed,
	}: {
		customerId: string;
		lockId: string;
		owed: readonly JournalEntry[];
	}): TrackCommand | null {
		const held = tracksByCustomer.get(customerId)?.get(lockId);
		if (held) return held;
		return (
			owed.find(({ command }) => command.lock?.lockId === lockId)?.command ??
			null
		);
	}

	/** After a push: a lock leaves once nothing owed takes it and Autumn no longer shows it open. */
	function settle({
		customerId,
		owed,
		openLockIds,
	}: {
		customerId: string;
		owed: readonly JournalEntry[];
		openLockIds: ReadonlySet<string>;
	}): void {
		const tracks = tracksByCustomer.get(customerId);
		if (!tracks) return;
		const owedLockIds = new Set(
			owed.map(({ command }) => command.lock?.lockId),
		);
		for (const lockId of tracks.keys())
			if (!owedLockIds.has(lockId) && !openLockIds.has(lockId))
				tracks.delete(lockId);
		if (tracks.size === 0) tracksByCustomer.delete(customerId);
	}

	return { hold, trackOf, settle };
};

export type OpenLocks = ReturnType<typeof createOpenLocks>;
