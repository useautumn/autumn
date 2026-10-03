import type { DeferredLogs } from "../types/deferredLogs.js";

export function createDeferredLogs({
	maxInFlight,
}: {
	maxInFlight: number;
}): DeferredLogs {
	const inFlight = new Set<Promise<void>>();
	let firstFailure: { cause: unknown } | null = null;

	function add(log: Promise<void>): void {
		const landed = log.then(
			() => undefined,
			(cause: unknown) => {
				firstFailure ??= { cause };
			},
		);
		inFlight.add(landed);
		void landed.then(() => inFlight.delete(landed));
	}

	async function waitForRoom(): Promise<void> {
		while (inFlight.size >= maxInFlight) await Promise.race(inFlight);
	}

	async function settle(): Promise<void> {
		await Promise.all(inFlight);
		if (firstFailure) throw firstFailure.cause;
	}

	return { add, waitForRoom, settle };
}
