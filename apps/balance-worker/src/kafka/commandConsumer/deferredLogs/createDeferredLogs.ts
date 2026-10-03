import type { DeferredLogs } from "../types/deferredLogs.js";

function ignoreOutcome(): void {}

export function createDeferredLogs({
	maxCommitsInFlight,
}: {
	maxCommitsInFlight: number;
}): DeferredLogs {
	const logs: Promise<void>[] = [];
	const commitsInFlight = new Set<Promise<void>>();

	function add(commit: Promise<void>): void {
		logs.push(commit);
		const landed = commit.then(ignoreOutcome, ignoreOutcome);
		commitsInFlight.add(landed);
		void landed.then(() => commitsInFlight.delete(landed));
	}

	async function waitForRoom(): Promise<void> {
		while (commitsInFlight.size >= maxCommitsInFlight)
			await Promise.race(commitsInFlight);
	}

	async function settle(): Promise<void> {
		await Promise.all(logs);
	}

	return { logs, add, waitForRoom, settle };
}
