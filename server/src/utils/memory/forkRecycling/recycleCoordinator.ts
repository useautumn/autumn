type RecycleCycle = {
	oldWorkerId: string;
	replacementId: string;
	drainSent: boolean;
};

export type RecycleCoordinator = {
	handleRecycleRequest: (args: { workerId: string }) => void;
	handleWorkerListening: (args: { workerId: string }) => void;
	/** Returns true when the exit was an expected recycle completion (caller
	 *  must not respawn); crashes are respawned via the injected callback. */
	handleWorkerExit: (args: { workerId: string }) => boolean;
};

/** One recycle in flight at a time: the replacement must be listening before
 *  the old fork is told to drain, so task capacity never drops below N forks. */
export const createRecycleCoordinator = ({
	forkReplacement,
	sendDrain,
	respawn,
	log,
}: {
	forkReplacement: () => string;
	sendDrain: (workerId: string) => void;
	respawn: (workerId: string) => void;
	log: (message: string) => void;
}): RecycleCoordinator => {
	let activeCycle: RecycleCycle | null = null;
	const pendingWorkerIds: string[] = [];
	const requestedWorkerIds = new Set<string>();

	const startCycle = (oldWorkerId: string) => {
		const replacementId = forkReplacement();
		activeCycle = { oldWorkerId, replacementId, drainSent: false };
		log(
			`[ForkRecycle] Replacing worker ${oldWorkerId}; replacement ${replacementId} booting`,
		);
	};

	const startNextPendingCycle = () => {
		activeCycle = null;
		const next = pendingWorkerIds.shift();
		if (next !== undefined) startCycle(next);
	};

	return {
		handleRecycleRequest: ({ workerId }) => {
			if (requestedWorkerIds.has(workerId)) return;
			requestedWorkerIds.add(workerId);

			if (activeCycle) {
				pendingWorkerIds.push(workerId);
				return;
			}
			startCycle(workerId);
		},

		handleWorkerListening: ({ workerId }) => {
			if (!activeCycle || activeCycle.replacementId !== workerId) return;
			if (activeCycle.drainSent) return;

			activeCycle.drainSent = true;
			log(
				`[ForkRecycle] Replacement ${workerId} listening; draining ${activeCycle.oldWorkerId}`,
			);
			sendDrain(activeCycle.oldWorkerId);
		},

		handleWorkerExit: ({ workerId }) => {
			if (activeCycle?.oldWorkerId === workerId) {
				const wasExpected = activeCycle.drainSent;
				requestedWorkerIds.delete(workerId);
				startNextPendingCycle();
				if (wasExpected) {
					log(`[ForkRecycle] Worker ${workerId} recycled`);
					return true;
				}
				// Died before its drain was ever sent — a plain crash.
				respawn(workerId);
				return false;
			}

			if (activeCycle?.replacementId === workerId) {
				// Replacement crashed during boot: abort so the old fork keeps
				// serving, and let the standard crash path replace the replacement.
				log(
					`[ForkRecycle] Replacement ${workerId} died before listening; aborting recycle of ${activeCycle.oldWorkerId}`,
				);
				requestedWorkerIds.delete(activeCycle.oldWorkerId);
				startNextPendingCycle();
				respawn(workerId);
				return false;
			}

			requestedWorkerIds.delete(workerId);
			const pendingIndex = pendingWorkerIds.indexOf(workerId);
			if (pendingIndex !== -1) pendingWorkerIds.splice(pendingIndex, 1);
			respawn(workerId);
			return false;
		},
	};
};
