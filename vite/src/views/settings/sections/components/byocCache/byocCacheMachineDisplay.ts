import {
	type ApiByocCache,
	type ByocCacheMachine,
	findByocCacheMachine,
} from "@autumn/shared";

export const byocCacheMachineLabel = (machine: ByocCacheMachine) =>
	machine.tier;

export const byocCacheMachineSpecs = (machine: ByocCacheMachine) =>
	`${machine.cpu} vCPU · ${machine.memory} GiB`;

/** One line naming the tier, its size and its price, e.g. "Large · 8 vCPU · 16 GiB · ~$220/mo". */
export const byocCacheMachineSummary = (machine: ByocCacheMachine) =>
	`${machine.tier} · ${byocCacheMachineSpecs(machine)} · ~$${machine.estimatedMonthlyUsd}/mo`;

export const BYOC_CACHE_RESIZE_NOTE =
	"Resizing takes up to a minute. During this time the SDK falls back to the Autumn API.";

/** Null while the cache runs on a machine Autumn does not offer. */
export const cacheToMachine = (
	cache: ApiByocCache,
): ByocCacheMachine | null => {
	if (cache.cpu === null || cache.memory === null) return null;
	return findByocCacheMachine({ cpu: cache.cpu, memory: cache.memory }) ?? null;
};
