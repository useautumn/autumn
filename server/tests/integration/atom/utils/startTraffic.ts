import { timeout } from "@tests/utils/genUtils.js";

export const startTraffic = <T>({
	send,
	everyMs,
	lanes = 1,
}: {
	send: () => Promise<T>;
	everyMs: number;
	lanes?: number;
}) => {
	let running = true;
	const results: T[] = [];

	async function runLane(): Promise<void> {
		while (running) {
			results.push(await send());
			await timeout(everyMs);
		}
	}

	const loops = Array.from({ length: lanes }, runLane);
	return {
		stop: async (): Promise<T[]> => {
			running = false;
			await Promise.all(loops);
			return results;
		},
	};
};
