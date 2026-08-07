type RecycleCycle = {
	oldWorkerId: string;
	replacementId: string;
	drainSent: boolean;
	/** Replacement is listening but the drain waits for crash respawns to
	 *  finish booting, so capacity never dips below N mid-recycle. */
	drainDeferred: boolean;
	/** Old worker crashed before drain; the booting replacement is adopted as
	 *  its respawn, so the cycle completes on `listening` without a drain. */
	oldExited: boolean;
};

export type RecycleCoordinator = {
	handleRecycleRequest: (args: { workerId: string }) => void;
	handleWorkerListening: (args: { workerId: string }) => void;
	/** Returns true when the exit was an expected recycle completion (caller
	 *  must not treat it as a crash); the coordinator owns all respawns. */
	handleWorkerExit: (args: { workerId: string }) => boolean;
};

export const DEFAULT_REPLACEMENT_BOOT_TIMEOUT_MS = 120_000;

/** One recycle in flight at a time, and an invariant every path must hold:
 *  the serving fork count returns to N — no surplus, no deficit. */
export const createRecycleCoordinator = ({
	forkReplacement,
	sendDrain,
	sendAbort,
	killWorker,
	respawn,
	replacementBootTimeoutMs = DEFAULT_REPLACEMENT_BOOT_TIMEOUT_MS,
	log,
}: {
	forkReplacement: () => string;
	sendDrain: (workerId: string) => void;
	/** Tells a still-serving worker its cycle was aborted so it may request
	 *  again later (clears the worker-side request latch). */
	sendAbort: (workerId: string) => void;
	/** Force-kills a replacement that never reached `listening`. */
	killWorker: (workerId: string) => void;
	/** Forks a crash replacement; returns its worker id (undefined when the
	 *  caller is shutting down and skipped the fork). */
	respawn: (workerId: string) => string | undefined;
	replacementBootTimeoutMs?: number;
	log: (message: string) => void;
}): RecycleCoordinator => {
	let activeCycle: RecycleCycle | null = null;
	let bootDeadline: ReturnType<typeof setTimeout> | null = null;
	const pendingWorkerIds: string[] = [];
	const requestedWorkerIds = new Set<string>();
	const expectedExitWorkerIds = new Set<string>();
	// Replacements killed for hanging: their eventual exit needs no respawn.
	const discardedWorkerIds = new Set<string>();
	// Crash respawns still booting: drains wait for these so a recycle never
	// stacks on top of reduced capacity.
	const bootingRespawnIds = new Set<string>();

	const respawnBootDeadlines = new Map<string, ReturnType<typeof setTimeout>>();

	const untrackBootingRespawn = (workerId: string): boolean => {
		const deadline = respawnBootDeadlines.get(workerId);
		if (deadline) clearTimeout(deadline);
		respawnBootDeadlines.delete(workerId);
		return bootingRespawnIds.delete(workerId);
	};

	const respawnTracked = (workerId: string) => {
		const newWorkerId = respawn(workerId);
		if (newWorkerId === undefined) return;
		bootingRespawnIds.add(newWorkerId);
		// A respawn that hangs before `listening` would defer drains forever.
		const deadline = setTimeout(() => {
			if (!untrackBootingRespawn(newWorkerId)) return;
			log(
				`[ForkRecycle] Crash respawn ${newWorkerId} not listening after ${replacementBootTimeoutMs}ms; killing and replacing it`,
			);
			discardedWorkerIds.add(newWorkerId);
			killWorker(newWorkerId);
			respawnTracked(newWorkerId);
			releaseDeferredDrainIfClear();
		}, replacementBootTimeoutMs);
		deadline.unref?.();
		respawnBootDeadlines.set(newWorkerId, deadline);
	};

	const sendDrainNow = (cycle: RecycleCycle) => {
		cycle.drainSent = true;
		cycle.drainDeferred = false;
		expectedExitWorkerIds.add(cycle.oldWorkerId);
		log(
			`[ForkRecycle] Replacement ${cycle.replacementId} listening; draining ${cycle.oldWorkerId}`,
		);
		sendDrain(cycle.oldWorkerId);
	};

	const releaseDeferredDrainIfClear = () => {
		if (bootingRespawnIds.size > 0) return;
		if (activeCycle?.drainDeferred && !activeCycle.drainSent) {
			sendDrainNow(activeCycle);
		}
	};

	const clearBootDeadline = () => {
		if (bootDeadline) clearTimeout(bootDeadline);
		bootDeadline = null;
	};

	const startCycle = (oldWorkerId: string) => {
		const replacementId = forkReplacement();
		activeCycle = {
			oldWorkerId,
			replacementId,
			drainSent: false,
			drainDeferred: false,
			oldExited: false,
		};
		log(
			`[ForkRecycle] Replacing worker ${oldWorkerId}; replacement ${replacementId} booting`,
		);
		bootDeadline = setTimeout(() => {
			if (!activeCycle || activeCycle.replacementId !== replacementId) return;
			if (activeCycle.drainSent) return;
			// Alive but never listening (hung init): without this deadline the
			// cycle would hold the recycle queue forever.
			log(
				`[ForkRecycle] Replacement ${replacementId} not listening after ${replacementBootTimeoutMs}ms; killing and aborting recycle of ${oldWorkerId}`,
			);
			discardedWorkerIds.add(replacementId);
			const { oldExited } = activeCycle;
			requestedWorkerIds.delete(oldWorkerId);
			if (oldExited) {
				respawnTracked(replacementId);
			} else {
				sendAbort(oldWorkerId);
			}
			killWorker(replacementId);
			startNextPendingCycle();
		}, replacementBootTimeoutMs);
		bootDeadline.unref?.();
	};

	const startNextPendingCycle = () => {
		clearBootDeadline();
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
			if (untrackBootingRespawn(workerId)) {
				releaseDeferredDrainIfClear();
				return;
			}

			if (!activeCycle || activeCycle.replacementId !== workerId) return;
			if (activeCycle.drainSent) return;

			if (activeCycle.oldExited) {
				// The worker this replacement was for already crashed; the
				// replacement simply takes its slot.
				log(
					`[ForkRecycle] Replacement ${workerId} listening; adopted for crashed worker ${activeCycle.oldWorkerId}`,
				);
				startNextPendingCycle();
				return;
			}

			clearBootDeadline();
			if (bootingRespawnIds.size > 0) {
				// A crash respawn is still booting; draining now would dip below N.
				activeCycle.drainDeferred = true;
				log(
					`[ForkRecycle] Replacement ${workerId} listening; deferring drain of ${activeCycle.oldWorkerId} until ${bootingRespawnIds.size} crash respawn(s) boot`,
				);
				return;
			}
			sendDrainNow(activeCycle);
		},

		handleWorkerExit: ({ workerId }) => {
			// A crash respawn dying while booting falls through to the plain-crash
			// branch below (which respawns again); the deferred-drain release runs
			// only after that branch has tracked the new respawn.
			const wasBootingRespawn = untrackBootingRespawn(workerId);
			const wasExpected = (() => {
				if (discardedWorkerIds.has(workerId)) {
					// A hung replacement we already killed and accounted for.
					discardedWorkerIds.delete(workerId);
					requestedWorkerIds.delete(workerId);
					return true;
				}

				if (expectedExitWorkerIds.has(workerId)) {
					expectedExitWorkerIds.delete(workerId);
					requestedWorkerIds.delete(workerId);
					if (activeCycle?.oldWorkerId === workerId) startNextPendingCycle();
					log(`[ForkRecycle] Worker ${workerId} recycled`);
					return true;
				}

				if (activeCycle?.oldWorkerId === workerId) {
					requestedWorkerIds.delete(workerId);
					if (activeCycle.drainDeferred) {
						// Replacement is already listening (drain deferred): the crash
						// completes the cycle outright — a deferred drain to a dead
						// worker would wait forever on an exit that already happened.
						log(
							`[ForkRecycle] Worker ${workerId} died with drain deferred; replacement ${activeCycle.replacementId} adopts its slot`,
						);
						startNextPendingCycle();
						return false;
					}
					// Crashed before its drain: the already-booting replacement is its
					// respawn, so forking again here would leave a surplus worker.
					activeCycle.oldExited = true;
					log(
						`[ForkRecycle] Worker ${workerId} died mid-recycle; replacement ${activeCycle.replacementId} adopts its slot`,
					);
					return false;
				}

				if (activeCycle?.replacementId === workerId) {
					const { oldWorkerId, drainSent } = activeCycle;
					if (drainSent) {
						// Old worker is already draining and stays an expected exit; the
						// dead replacement's slot is the one that needs refilling.
						log(
							`[ForkRecycle] Replacement ${workerId} died after listening; respawning while ${oldWorkerId} finishes draining`,
						);
						startNextPendingCycle();
						respawnTracked(workerId);
						return false;
					}
					// Died while booting. If the old worker still serves, no capacity was
					// lost — abort and let it ask again later. If the old worker had
					// crashed too, this replacement WAS its slot: refill it.
					log(
						`[ForkRecycle] Replacement ${workerId} died before listening; aborting recycle of ${oldWorkerId}`,
					);
					requestedWorkerIds.delete(oldWorkerId);
					if (activeCycle.oldExited) {
						respawnTracked(workerId);
					} else {
						sendAbort(oldWorkerId);
					}
					startNextPendingCycle();
					return false;
				}

				requestedWorkerIds.delete(workerId);
				const pendingIndex = pendingWorkerIds.indexOf(workerId);
				if (pendingIndex !== -1) pendingWorkerIds.splice(pendingIndex, 1);
				respawnTracked(workerId);
				return false;
			})();
			if (wasBootingRespawn) releaseDeferredDrainIfClear();
			return wasExpected;
		},
	};
};
