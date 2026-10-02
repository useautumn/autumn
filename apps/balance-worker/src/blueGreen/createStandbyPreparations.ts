export type StandbyPreparations = {
	acquire(params: { signal: AbortSignal }): Promise<() => void>;
};

type QueuedPreparation = {
	grant(release: () => void): void;
};

const unlimited = (): void => undefined;

export function createStandbyPreparations({
	ctx,
	config,
}: {
	ctx: { gate: { isActive(): boolean } };
	config: { concurrency: number };
}): StandbyPreparations {
	let running = 0;
	const queue: QueuedPreparation[] = [];

	function takeSlot(): () => void {
		running += 1;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			running -= 1;
			grantQueued();
		};
	}

	function grantQueued(): void {
		if (ctx.gate.isActive()) {
			for (const queued of queue.splice(0)) queued.grant(unlimited);
			return;
		}
		while (running < config.concurrency) {
			const next = queue.shift();
			if (!next) return;
			next.grant(takeSlot());
		}
	}

	function acquire({ signal }: { signal: AbortSignal }): Promise<() => void> {
		if (signal.aborted) return Promise.reject(signal.reason);
		if (ctx.gate.isActive()) return Promise.resolve(unlimited);
		if (running < config.concurrency) return Promise.resolve(takeSlot());
		return new Promise((resolve, reject) => {
			const queued: QueuedPreparation = {
				grant: (release) => {
					signal.removeEventListener("abort", leave);
					resolve(release);
				},
			};
			function leave(): void {
				const index = queue.indexOf(queued);
				if (index !== -1) queue.splice(index, 1);
				reject(signal.reason);
			}
			signal.addEventListener("abort", leave, { once: true });
			queue.push(queued);
		});
	}

	return { acquire };
}
