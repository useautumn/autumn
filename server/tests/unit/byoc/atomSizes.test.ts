import { describe, expect, test } from "bun:test";
import {
	BYOC_CACHE_MACHINES,
	BYOC_CACHE_REPLICAS,
	byocCacheMonthlyUsd,
	byocCacheStorageMonthlyUsd,
	DEFAULT_BYOC_CACHE_MACHINE,
	DEFAULT_BYOC_CACHE_VOLUME_GIB,
} from "@autumn/shared";
import alienStack from "../../../../packages/alien/stacks/byoc/alien.json";

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

const toBytes = (memory: string) => {
	const [, amount, unit] = /^([\d.]+)(Mi|Gi)$/.exec(memory) ?? [];
	if (!amount) throw new Error(`Unreadable memory ${memory}`);
	return Number(amount) * (unit === "Gi" ? GIB : MIB);
};

/** alien-core 3.3.32 `instance_catalog::allocatable_cpu` / `allocatable_memory_bytes`: what a pinned machine leaves a container. */
const alienAllocatable = ({ cpu, memory }: { cpu: number; memory: number }) => {
	const bytes = memory * GIB;
	const reserve =
		bytes < 4 * GIB ? 256 * MIB : bytes < 16 * GIB ? 512 * MIB : GIB;
	return { cpu: Math.max(cpu - 0.5, 0.25), memory: bytes - reserve };
};

/** GKE's documented node memory reserve (plan-node-sizes), the largest of the published ones up to 16 GiB. */
const gkeMemoryReserve = ({ memory }: { memory: number }) =>
	(0.25 * Math.min(memory, 4) +
		0.2 * Math.min(Math.max(memory - 4, 0), 4) +
		0.1 * Math.min(Math.max(memory - 8, 0), 8)) *
		GIB +
	100 * MIB;

const fitsPinnedMachine = ({
	machine,
	container,
}: {
	machine: { cpu: number; memory: number };
	container: { cpu: number; memory: number };
}) => {
	const allocatable = alienAllocatable(machine);
	return (
		container.cpu <= allocatable.cpu &&
		container.memory * GIB <= allocatable.memory
	);
};

const atomResource = alienStack.resources.atom.config;

describe("Atom sizes", () => {
	test.each(
		BYOC_CACHE_MACHINES.map((machine) => [machine.instanceType, machine]),
	)(
		"%s fits its container after alien's host reserve, with GKE's reserve to spare",
		(_, machine) => {
			expect(fitsPinnedMachine({ machine, container: machine.container })).toBe(
				true,
			);
			const left = machine.memory * GIB - machine.container.memory * GIB;
			expect(left).toBeGreaterThanOrEqual(gkeMemoryReserve(machine));
			expect(machine.cpu - machine.container.cpu).toBeGreaterThanOrEqual(1);
		},
	);

	test("a container as big as its machine does not fit it", () => {
		const machine = { cpu: 4, memory: 8 };
		expect(
			fitsPinnedMachine({ machine, container: { cpu: 4, memory: 6 } }),
		).toBe(false);
		expect(
			fitsPinnedMachine({ machine, container: { cpu: 3, memory: 8 } }),
		).toBe(false);
	});

	test("every size is inside the resource ranges the stack releases", () => {
		const { cpu, memory } = atomResource.resourceChoices;
		for (const { container } of BYOC_CACHE_MACHINES) {
			expect(container.cpu).toBeGreaterThanOrEqual(Number(cpu.min));
			expect(container.cpu).toBeLessThanOrEqual(Number(cpu.max));
			expect(container.memory * GIB).toBeGreaterThanOrEqual(
				toBytes(memory.min),
			);
			expect(container.memory * GIB).toBeLessThanOrEqual(toBytes(memory.max));
		}
	});

	test("the default size is the stack's default, so a setup that names none is unchanged", () => {
		const { cpu, memory } = atomResource.resourceChoices;
		const { container } = DEFAULT_BYOC_CACHE_MACHINE;
		expect<number>(container.cpu).toBe(Number(cpu.default));
		expect(container.memory * GIB).toBe(toBytes(memory.default));
		expect(atomResource.cpu.desired).toBe(cpu.default);
		expect(atomResource.memory.desired).toBe(memory.default);
	});

	test("the stack runs as many replicas as Autumn sizes machines for", () => {
		expect(atomResource.replicas).toBe(BYOC_CACHE_REPLICAS);
	});

	test("the stack's default data disk is the size an Atom gets when it picks none", () => {
		expect(atomResource.persistentStorage).toEqual({
			mountPath: "/data",
			size: `${DEFAULT_BYOC_CACHE_VOLUME_GIB}Gi`,
		});
	});

	const monthlyEstimates = ({ volumeSizeGib }: { volumeSizeGib: number }) =>
		Object.fromEntries(
			BYOC_CACHE_MACHINES.map((machine) => [
				machine.instanceType,
				byocCacheMonthlyUsd({ machine, volumeSizeGib }),
			]),
		);

	test("monthly estimates are both replicas' machine and 20 GiB disk at us-east-1 list price", () => {
		expect(monthlyEstimates({ volumeSizeGib: 20 })).toEqual({
			"t4g.micro": 15,
			"t4g.small": 28,
			"c8g.large": 120,
			"c8g.xlarge": 236,
			"c8g.2xlarge": 469,
			"c8g.4xlarge": 935,
		});
	});

	test("a bigger disk adds both replicas' gp3 volumes to every machine's estimate", () => {
		expect(byocCacheStorageMonthlyUsd({ volumeSizeGib: 50 })).toBe(8);
		expect(monthlyEstimates({ volumeSizeGib: 50 })).toEqual({
			"t4g.micro": 20,
			"t4g.small": 33,
			"c8g.large": 124,
			"c8g.xlarge": 241,
			"c8g.2xlarge": 474,
			"c8g.4xlarge": 940,
		});
	});
});
