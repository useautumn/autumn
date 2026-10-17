import type { PartitionsState } from "../types/partitionState.js";

export function refreshHoldings({ state }: { state: PartitionsState }): void {
	const held = new Set([...state.assigned, ...state.handingOff.keys()]);
	for (const partition of [...state.holdings.keys()])
		if (!held.has(partition)) state.holdings.delete(partition);
	for (const partition of held)
		if (!state.holdings.has(partition)) {
			state.nextHolding += 1;
			state.holdings.set(partition, state.nextHolding);
		}
}
