import type {
	AlienContainerResources,
	AlienFixedPools,
} from "../types/alienClient.js";

/** alien's `compute` body; it rejects a pool without its failure-domain spread, and spread 1 keeps a pool's machines and volumes in one zone.
 * A container left out runs at the release's default allocation, so every caller sends both. */
export const toComputeSettings = ({
	pools,
	containers,
}: {
	pools: AlienFixedPools;
	containers: AlienContainerResources;
}) => ({
	pools: Object.fromEntries(
		Object.entries(pools).map(([name, { machine, machines }]) => [
			name,
			{ mode: "fixed", machines, machine, failure_domains: { spread: 1 } },
		]),
	),
	containers,
});
