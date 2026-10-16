import { describe, expect, test } from "bun:test";
import { deploymentToVolumeSizeGib } from "../../src/alien.js";

const withContainers = (containers: Record<string, unknown>) => ({
	id: "dep_1",
	status: "running",
	stackSettings: {
		compute: { pools: {}, containers },
	},
});

describe("a deployment's volume size", () => {
	test("is the size its compute settings select for the container", () => {
		const deployment = withContainers({
			atom: { cpu: 3, memory: "6Gi", volumeSizeGib: 50 },
		});

		expect(deploymentToVolumeSizeGib({ deployment, resourceId: "atom" })).toBe(
			50,
		);
	});

	test("is null when the container selects none and runs the release default", () => {
		const deployment = withContainers({ atom: { cpu: 3, memory: "6Gi" } });

		expect(
			deploymentToVolumeSizeGib({ deployment, resourceId: "atom" }),
		).toBeNull();
	});

	test("is null for a deployment with no compute settings", () => {
		const deployment = { id: "dep_1", status: "running" };

		expect(
			deploymentToVolumeSizeGib({ deployment, resourceId: "atom" }),
		).toBeNull();
	});
});
