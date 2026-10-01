import type { AlienFixedPools } from "../types/alienClient.js";

/** alien's `compute` body; it rejects a pool without its failure-domain spread, and one machine spans one domain. */
export const fixedPoolsToCompute = ({ pools }: { pools: AlienFixedPools }) => ({
	pools: Object.fromEntries(
		Object.entries(pools).map(([name, { machine, machines }]) => [
			name,
			{ mode: "fixed", machines, machine, failure_domains: { spread: 1 } },
		]),
	),
});
