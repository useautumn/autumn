import {
	type ApiByocCache,
	type ByocCacheMachine,
	findByocCacheMachine,
} from "@autumn/shared";

/** Names only the dashboard uses; the API speaks in `cpu` and `memory`. */
const MACHINE_LABELS: Record<ByocCacheMachine["instanceType"], string> = {
	"t4g.micro": "Starter",
	"t4g.medium": "Small",
	"c7g.xlarge": "Medium",
	"c7g.2xlarge": "Large",
	"c7g.4xlarge": "XL",
};

export const atomMachineLabel = (machine: ByocCacheMachine) =>
	MACHINE_LABELS[machine.instanceType];

export const atomMachineSpecs = (machine: ByocCacheMachine) =>
	`${machine.cpu} vCPU · ${machine.memory} GiB`;

export const ATOM_RESIZE_NOTE =
	"Resizing takes up to a minute. During this time the SDK falls back to the Autumn API.";

/** Null while Atom runs on a machine Autumn does not offer. */
export const cacheToMachine = (
	cache: ApiByocCache,
): ByocCacheMachine | null => {
	if (cache.cpu === null || cache.memory === null) return null;
	return findByocCacheMachine({ cpu: cache.cpu, memory: cache.memory }) ?? null;
};
