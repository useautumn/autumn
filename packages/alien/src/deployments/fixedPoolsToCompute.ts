import type { AlienFixedPools } from "../types/alienClient.js";

export const fixedPoolsToCompute = ({ pools }: { pools: AlienFixedPools }) => ({
	pools: Object.fromEntries(
		Object.entries(pools).map(([name, { machine, machines }]) => [
			name,
			{ mode: "fixed", machines, machine, failure_domains: { spread: 1 } },
		]),
	),
});
