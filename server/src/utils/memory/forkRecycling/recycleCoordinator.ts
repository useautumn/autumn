type RecycleCycle = {
	oldWorkerId: string;
	replacementId: string;
	drainSent: boolean;
	drainDeferred: boolean;
	oldExited: boolean;
};

export type RecycleCoordinator = {
	handleRecycleRequest: (args: { workerId: string }) => void;
	handleWorkerListening: (args: { workerId: string }) => void;
	handleWorkerExit: (args: { workerId: string }) => boolean;
};

export const DEFAULT_REPLACEMENT_BOOT_TIMEOUT_MS = 120_000;
export const DEFAULT_DRAIN_COMPLETION_TIMEOUT_MS = 12 * 60_000;

export const createRecycleCoordinator = ({
	forkReplacement,
	sendDrain,
	sendAbort,
	killWorker,
	respawn,
	replacementBootTimeoutMs = DEFAULT_REPLACEMENT_BOOT_TIMEOUT_MS,
	drainCompletionTimeoutMs = DEFAULT_DRAIN_COMPLETION_TIMEOUT_MS,
	log,
}: {
	forkReplacement: () => string;
	sendDrain: (workerId: string) => void;
	sendAbort: (workerId: string) => void;
	killWorker: (workerId: string) => void;
	respawn: (workerId: string) => string | undefined;
	replacementBootTimeoutMs?: number;
	drainCompletionTimeoutMs?: number;
	log: (message: string) => void;
}): RecycleCoordinator => {
	let activeCycle: RecycleCycle | null = null;
	let bootDeadline: ReturnType<typeof setTimeout> | null = null;
	const pendingWorkerIds: string[] = [];
	const requestedWorkerIds = new Set<string>();
	const expectedExitWorkerIds = new Set<string>();
	const discardedWorkerIds = new Set<string>();
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

	const drainCompletionDeadlines = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();

	const clearDrainCompletionDeadline = (workerId: string) => {
		const deadline = drainCompletionDeadlines.get(workerId);
		if (deadline) clearTimeout(deadline);
		drainCompletionDeadlines.delete(workerId);
	};

	const sendDrainNow = (cycle: RecycleCycle) => {
		cycle.drainSent = true;
		cycle.drainDeferred = false;
		expectedExitWorkerIds.add(cycle.oldWorkerId);
		log(
			`[ForkRecycle] Replacement ${cycle.replacementId} listening; draining ${cycle.oldWorkerId}`,
		);
		sendDrain(cycle.oldWorkerId);
		const deadline = setTimeout(() => {
			drainCompletionDeadlines.delete(cycle.oldWorkerId);
			log(
				`[ForkRecycle] Worker ${cycle.oldWorkerId} did not exit within ${drainCompletionTimeoutMs}ms of its drain; killing it (replacement already serving)`,
			);
			killWorker(cycle.oldWorkerId);
		}, drainCompletionTimeoutMs);
		deadline.unref?.();
		drainCompletionDeadlines.set(cycle.oldWorkerId, deadline);
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
				log(
					`[ForkRecycle] Replacement ${workerId} listening; adopted for crashed worker ${activeCycle.oldWorkerId}`,
				);
				startNextPendingCycle();
				return;
			}

			clearBootDeadline();
			if (bootingRespawnIds.size > 0) {
				activeCycle.drainDeferred = true;
				log(
					`[ForkRecycle] Replacement ${workerId} listening; deferring drain of ${activeCycle.oldWorkerId} until ${bootingRespawnIds.size} crash respawn(s) boot`,
				);
				return;
			}
			sendDrainNow(activeCycle);
		},

		handleWorkerExit: ({ workerId }) => {
			clearDrainCompletionDeadline(workerId);
			const pendingIndex = pendingWorkerIds.indexOf(workerId);
			if (pendingIndex !== -1) pendingWorkerIds.splice(pendingIndex, 1);
			requestedWorkerIds.delete(workerId);
			const wasBootingRespawn = untrackBootingRespawn(workerId);
			const wasExpected = (() => {
				if (discardedWorkerIds.has(workerId)) {
					discardedWorkerIds.delete(workerId);
					return true;
				}

				if (expectedExitWorkerIds.has(workerId)) {
					expectedExitWorkerIds.delete(workerId);
					if (activeCycle?.oldWorkerId === workerId) startNextPendingCycle();
					log(`[ForkRecycle] Worker ${workerId} recycled`);
					return true;
				}

				if (activeCycle?.oldWorkerId === workerId) {
					if (activeCycle.drainDeferred) {
						log(
							`[ForkRecycle] Worker ${workerId} died with drain deferred; replacement ${activeCycle.replacementId} adopts its slot`,
						);
						startNextPendingCycle();
						return false;
					}
					activeCycle.oldExited = true;
					log(
						`[ForkRecycle] Worker ${workerId} died mid-recycle; replacement ${activeCycle.replacementId} adopts its slot`,
					);
					return false;
				}

				if (activeCycle?.replacementId === workerId) {
					const { oldWorkerId, drainSent } = activeCycle;
					if (drainSent) {
						log(
							`[ForkRecycle] Replacement ${workerId} died after listening; respawning while ${oldWorkerId} finishes draining`,
						);
						startNextPendingCycle();
						respawnTracked(workerId);
						return false;
					}
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

				respawnTracked(workerId);
				return false;
			})();
			if (wasBootingRespawn) releaseDeferredDrainIfClear();
			return wasExpected;
		},
	};
};
