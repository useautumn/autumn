import {
	type ApiByocCache,
	BYOC_CACHE_REPLICAS,
	type ByocCacheMachine,
	byocCacheMachineMonthlyUsd,
	findByocCacheMachine,
} from "@autumn/shared";

const MACHINE_LABELS: Record<ByocCacheMachine["instanceType"], string> = {
	"t4g.micro": "XXS",
	"t4g.small": "XS",
	"c8g.large": "Small",
	"c8g.xlarge": "Medium",
	"c8g.2xlarge": "Large",
	"c8g.4xlarge": "XL",
};

export const DEFAULT_ATOM_INSTANCE_TYPE: ByocCacheMachine["instanceType"] =
	"c8g.xlarge";

export const atomMachineLabel = (machine: ByocCacheMachine) =>
	MACHINE_LABELS[machine.instanceType];

export const atomMachineSpecs = (machine: ByocCacheMachine) =>
	`${machine.cpu} vCPU · ${machine.memory} GiB`;

export const atomMachinesLabel = (machine: ByocCacheMachine) =>
	`${BYOC_CACHE_REPLICAS} × ${machine.instanceType}`;

export const atomMonthlyEstimate = (machine: ByocCacheMachine) =>
	`~$${byocCacheMachineMonthlyUsd(machine)}`;

export const atomContainerSpecs = ({ container }: ByocCacheMachine) =>
	`${container.cpu} vCPU · ${container.memory} GiB`;

export const ATOM_RESIZE_NOTE =
	"Resizing takes up to a minute. During this time the SDK falls back to the Autumn API.";

export const cacheToMachine = (
	cache: ApiByocCache,
): ByocCacheMachine | null => {
	if (cache.cpu === null || cache.memory === null) return null;
	return findByocCacheMachine({ cpu: cache.cpu, memory: cache.memory }) ?? null;
};
