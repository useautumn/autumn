import type { SlotGate } from "./createSlotGate.js";

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
	ctx: { gate: Pick<SlotGate, "isActive" | "subscribe"> };
	config: { concurrency: number };
}): StandbyPreparations {
	let running = 0;
	const queue: QueuedPreparation[] = [];
	let stopWatchingGate: (() => void) | null = null;

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
		if (ctx.gate.isActive())
			for (const queued of queue.splice(0)) queued.grant(unlimited);
		while (queue.length > 0 && running < config.concurrency)
			queue.shift()?.grant(takeSlot());
		if (queue.length === 0) unwatchGate();
	}

	function watchGate(): void {
		stopWatchingGate ??= ctx.gate.subscribe(grantQueued);
	}

	function unwatchGate(): void {
		stopWatchingGate?.();
		stopWatchingGate = null;
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
				if (queue.length === 0) unwatchGate();
				reject(signal.reason);
			}
			signal.addEventListener("abort", leave, { once: true });
			queue.push(queued);
			watchGate();
		});
	}

	return { acquire };
}
