import {
	type ApiByocCache,
	type ByocCacheMachine,
	findByocCacheMachine,
} from "@autumn/shared";

type AtomMachineDisplay = {
	label: string;
	/** Only measured capacity is shown; the rest is unmeasured. */
	checksPerSecond: string | null;
};

/** Names only the dashboard uses; the API speaks in `cpu` and `memory`. */
const MACHINE_DISPLAY: Record<
	ByocCacheMachine["instanceType"],
	AtomMachineDisplay
> = {
	"t4g.micro": { label: "Starter", checksPerSecond: null },
	"t4g.medium": { label: "Small", checksPerSecond: null },
	"c7g.xlarge": { label: "Medium", checksPerSecond: null },
	"c7g.2xlarge": { label: "Large", checksPerSecond: "13.5k" },
	"c7g.4xlarge": { label: "XL", checksPerSecond: null },
};

/** The size most apps fit, picked when setup starts. */
export const RECOMMENDED_ATOM_INSTANCE_TYPE: ByocCacheMachine["instanceType"] =
	"c7g.xlarge";

export const atomMachineLabel = (machine: ByocCacheMachine) =>
	MACHINE_DISPLAY[machine.instanceType].label;

export const atomMachineChecksPerSecond = (machine: ByocCacheMachine) =>
	MACHINE_DISPLAY[machine.instanceType].checksPerSecond;

export const atomMachineSpecs = (machine: ByocCacheMachine) =>
	`${machine.cpu} vCPU · ${machine.memory} GB`;

export const ATOM_RESIZE_NOTE =
	"Resizing takes up to a minute. During this time the SDK falls back to the Autumn API.";

/** Null while Atom runs on a machine Autumn does not offer. */
export const cacheToMachine = (
	cache: ApiByocCache,
): ByocCacheMachine | null => {
	if (cache.cpu === null || cache.memory === null) return null;
	return findByocCacheMachine({ cpu: cache.cpu, memory: cache.memory }) ?? null;
};
