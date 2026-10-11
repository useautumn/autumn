import {
	type ApiByocCache,
	type ByocCacheMachine,
	findByocCacheMachine,
} from "@autumn/shared";

/** Names only the dashboard uses; the API speaks in `cpu` and `memory`. */
const MACHINE_LABELS: Record<ByocCacheMachine["instanceType"], string> = {
	"c8g.large": "Small",
	"c8g.xlarge": "Medium",
	"c8g.2xlarge": "Large",
};

/** The size most apps fit, picked when setup starts. */
export const RECOMMENDED_ATOM_INSTANCE_TYPE: ByocCacheMachine["instanceType"] =
	"c8g.xlarge";

export const atomMachineLabel = (machine: ByocCacheMachine) =>
	MACHINE_LABELS[machine.instanceType];

/** What Atom itself gets: its container's share of the machine. */
export const atomMachineSpecs = ({ container }: ByocCacheMachine) =>
	`${container.cpu} vCPU · ${container.memory} GB`;

export const ATOM_RESIZE_NOTE =
	"Resizing takes up to a minute. During this time the SDK falls back to the Autumn API.";

/** Null while Atom runs on a machine Autumn does not offer. */
export const cacheToMachine = (
	cache: ApiByocCache,
): ByocCacheMachine | null => {
	if (cache.cpu === null || cache.memory === null) return null;
	return findByocCacheMachine({ cpu: cache.cpu, memory: cache.memory }) ?? null;
};
