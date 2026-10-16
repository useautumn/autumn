/** Requests this thread's processors are deciding right now; module state is the thread's own. */
let inFlightOnThread = 0;
const idleWaiters = new Set<() => void>();

/** Counts the request until `done` is called, whatever it ends in. */
export const beginRequest = (): { done(): void } => {
	inFlightOnThread++;
	return {
		done: () => {
			inFlightOnThread--;
			if (inFlightOnThread > 0) return;
			for (const wake of idleWaiters) wake();
			idleWaiters.clear();
		},
	};
};

/** True once no request is in flight on this thread; false at the deadline, when a late one's entries stay here for Autumn. */
export const waitForInFlight = ({
	withinMs,
}: {
	withinMs: number;
}): Promise<boolean> => {
	if (inFlightOnThread === 0) return Promise.resolve(true);
	return new Promise((resolve) => {
		const deadline = setTimeout(() => {
			idleWaiters.delete(idle);
			resolve(false);
		}, withinMs);
		function idle() {
			clearTimeout(deadline);
			resolve(true);
		}
		idleWaiters.add(idle);
	});
};
